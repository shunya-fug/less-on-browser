<script lang="ts">
  import { MessageTypeEnum } from "$lib/schemas/ReaderWorkerMessage";
  import * as ReaderWorkerMessageType from "$lib/types/ReaderWorkerMessage";
  import { clamp, throttle } from "es-toolkit";
  import { ceil, floor, includes } from "es-toolkit/compat";
  import { Menu } from "lucide-svelte";
  import rafSchd from "raf-schd";
  import { onDestroy, onMount, untrack } from "svelte";

  const OVER_SCAN = 100;

  let worker: Worker;
  let files: FileList | null | undefined = $state();
  let file: File | null = $derived(files?.[0] ?? null);
  let progressText = $state("ファイル未選択");
  let lineCount = $state(0);
  let lineCurrent = $state(0);
  let renderStart = $state(0);
  let visibleLines: string[] = $state([]);
  let cache = new Map<number, string[]>();
  let inflight = new Set<number>();
  let pendingBlockStart = -1;
  let viewer: HTMLDivElement;
  let viewerClientHeight: number | null = $state(null);
  let lineHeight = $state(20);
  let isDragOver = $state(false);

  let readConfig = $derived.by(() => {
    const viewport = ceil((viewerClientHeight ?? 0) / lineHeight) || 50;
    const chunkSize = Math.max(viewport + OVER_SCAN, 300);
    const stepSize = Math.max(1, floor(chunkSize / 2));
    return {
      stepSize,
      chunkSize,
    };
  });
  let block = $derived(floor(lineCurrent / readConfig.stepSize) * readConfig.stepSize);

  const openFileDialog = () => {
    document.getElementById("file-input")?.click();
  };

  const scheduleScroll = rafSchd((top: number) => {
    const newStart = clamp(floor(top / lineHeight), 0, Math.max(0, lineCount - 1));
    if (newStart !== lineCurrent) {
      lineCurrent = newStart;
      if (block !== pendingBlockStart && block !== renderStart) {
        read(block);
      }
    }
  });

  $effect(() => {
    read(block);
  });

  $effect(() => {
    if (!file || !worker) {
      return;
    }

    // 状態リセット
    untrack(() => {
      cache.clear();
      inflight.clear();
      pendingBlockStart = -1;
      renderStart = 0;
      lineCurrent = 0;
      lineCount = 0;
      visibleLines = [];
      viewer?.scrollTo({ top: 0 });
      scheduleScroll.cancel();
      // ドロップダウンメニューを閉じる
      (document.activeElement as HTMLElement)?.blur();
    });

    // インデックス作成
    worker.postMessage({
      messageType: MessageTypeEnum.enum.CreateIndex,
      file,
      encoding: "utf-16le",
    } as ReaderWorkerMessageType.CreateIndex);
  });

  function initWorker() {
    worker = new Worker(new URL("../lib/reader.worker.ts", import.meta.url), {
      type: "module",
    });

    const updateProgressMessage = throttle((done: number, total: number) => {
      const percent = ((done / total) * 100).toFixed(1);
      progressText = `ファイル読込中: ${percent}% (${done} / ${total} バイト)`;
    }, 100);

    worker.onmessage = (
      event: MessageEvent<
        | ReaderWorkerMessageType.CreateIndexStatus
        | ReaderWorkerMessageType.CreateIndexResult
        | ReaderWorkerMessageType.ReadResult
      >
    ) => {
      const message = event.data;
      switch (message.messageType) {
        // ファイル読込中
        case MessageTypeEnum.enum.CreateIndexStatus:
          updateProgressMessage(message.doneBytes, message.fileSize);
          break;

        // ファイル読込完了
        case MessageTypeEnum.enum.CreateIndexResult:
          updateProgressMessage.cancel();
          lineCount = message.lineCount;
          progressText = `読込完了: ${lineCount} 行`;
          read(0);
          break;

        // 読取結果
        case MessageTypeEnum.enum.ReadResult:
          cache.set(message.lineStart, message.lines);
          inflight.delete(message.lineStart);

          if (message.lineStart === pendingBlockStart) {
            visibleLines = message.lines;
            renderStart = message.lineStart;
            pendingBlockStart = -1;
          }

          const keys = [...cache.keys()].sort((a, b) => Math.abs(a - renderStart) - Math.abs(b - renderStart));
          for (let i = 3; i < keys.length; i++) {
            cache.delete(keys[i]);
          }
          break;
      }
    };
  }

  function read(startLine: number) {
    if (!worker) {
      return;
    }

    const start = clamp(startLine, 0, Math.max(0, lineCount - readConfig.chunkSize));
    const cacheHit = cache.get(start);
    if (cacheHit) {
      visibleLines = cacheHit;
      renderStart = start;
      pendingBlockStart = -1;
    } else {
      if (inflight.has(start)) {
        return;
      }
      inflight.add(start);
      pendingBlockStart = start;
      worker.postMessage({
        messageType: MessageTypeEnum.enum.Read,
        lineStart: start,
        count: readConfig.chunkSize,
      } as ReaderWorkerMessageType.Read);
    }

    const next = start + readConfig.stepSize;
    if (next < lineCount && !cache.has(next) && !inflight.has(next)) {
      worker.postMessage({
        messageType: MessageTypeEnum.enum.Read,
        lineStart: next,
        count: readConfig.chunkSize,
      } as ReaderWorkerMessageType.Read);
    }

    const prev = start - readConfig.stepSize;
    if (prev >= 0 && !cache.has(prev) && !inflight.has(prev)) {
      worker.postMessage({
        messageType: MessageTypeEnum.enum.Read,
        lineStart: prev,
        count: readConfig.chunkSize,
      } as ReaderWorkerMessageType.Read);
    }
  }

  const hasFiles = (event: DragEvent) => includes(event.dataTransfer?.types ?? [], "Files");

  function onDropFile(event: DragEvent) {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    isDragOver = false;
    files = event.dataTransfer?.files ?? null;
  }

  function onDragOver(event: DragEvent) {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
  }

  function onDragEnter(event: DragEvent) {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    isDragOver = true;
  }

  function onDragLeave(event: DragEvent) {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    isDragOver = false;
  }

  function onScrollViewer() {
    if (viewer) {
      scheduleScroll(viewer.scrollTop);
    }
  }

  onMount(() => {
    initWorker();
  });

  onDestroy(() => {
    scheduleScroll.cancel();
    worker?.terminate();
  });
</script>

{#snippet border()}
  <div class="border-t border-base-300"></div>
{/snippet}

<main class="p-3 h-screen">
  <div class="mockup-browser border-base-300 bg-base-200 border w-full h-full flex flex-col">
    <div class="mockup-browser-toolbar">
      <div class="ml-auto">{file?.name}</div>
    </div>
    {@render border()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="relative grow bg-base-100" ondrop={onDropFile} ondragover={onDragOver} ondragenter={onDragEnter}>
      <div
        class={[
          "sticky inset-0 h-full p-5 z-10 transition-[opacity,visibility] duration-150 ease-in-out",
          file && !isDragOver ? "opacity-0 invisible" : "opacity-70 visible",
        ]}
        ondragleave={onDragLeave}
      >
        <div class="relative h-full w-full pointer-events-none">
          <div
            class={[
              "absolute inset-0 h-full w-full flex rounded bg-base-100 border border-dashed transition-opacity duration-150 ease-in-out",
              isDragOver ? "opacity-100 visible" : "opacity-0 invisible",
            ]}
          ></div>
          <div class="absolute inset-0 flex items-center justify-center flex-col">
            <div>
              <div class="text-2xl font-bold">ここにファイルをドロップ</div>
              <input id="file-input" type="file" class="hidden" bind:files />
              {#if !file && !isDragOver}
                <div class="divider">OR</div>
                <button
                  class={["btn btn-wide btn-dash", !isDragOver && "pointer-events-auto"]}
                  onclick={openFileDialog}
                >
                  ファイルを選択
                </button>
              {/if}
            </div>
          </div>
        </div>
      </div>
      <div
        class="absolute inset-0 h-full ml-3 overflow-auto"
        bind:this={viewer}
        bind:clientHeight={viewerClientHeight}
        onscroll={onScrollViewer}
      >
        {#if file}
          <div style:height={`${Math.max(1, lineCount) * lineHeight}px`}>
            <div
              class="absolute will-change-transform top-0 inset-x-0"
              style:transform={`translateY(${renderStart * lineHeight}px)`}
            >
              {#each visibleLines as line}
                <div
                  class="overflow-hidden whitespace-pre font-mono"
                  style:height={`${lineHeight}px`}
                  style:lineHeight={`${lineHeight}px`}
                >
                  {line}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
    {@render border()}
    <div class="flex items-center gap-3">
      <div class="grow"></div>
      {progressText}
      <div class="dropdown dropdown-hover dropdown-top dropdown-end">
        <div tabindex="0" role="button" class="p-1 px-2 hover:cursor-pointer border-l border-l-gray-500">
          <Menu />
        </div>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <ul tabindex="0" class="dropdown-content menu rounded shadow-sm w-max p-1 px-3 text-lg bg-base-200">
          <li>
            <button class="px-5" onclick={openFileDialog}>ファイル選択</button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</main>
