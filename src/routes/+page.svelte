<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MessageTypeEnum } from "$lib/schemas/ReaderWorkerMessage";
  import * as ReaderWorkerMessageType from "$lib/types/ReaderWorkerMessage";
  import { clamp, throttle } from "es-toolkit";
  import { floor, ceil } from "es-toolkit/compat";
  import rafSchd from "raf-schd";

  const OVER_SCAN = 100;

  let worker: Worker;
  let file: File | null = $state(null);
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

  $effect(() => {
    read(block);
  });

  function initWorker() {
    worker = new Worker(new URL("../lib/reader.worker.ts", import.meta.url), {
      type: "module",
    });

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
          throttle(() => {
            const percent = ((message.doneBytes / message.fileSize) * 100).toFixed(1);
            progressText = `ファイル読込中: ${percent}% (${message.doneBytes} / ${message.fileSize} バイト)`;
          }, 100).flush();
          break;

        // ファイル読込完了
        case MessageTypeEnum.enum.CreateIndexResult:
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

    const start = clamp(startLine, 0, lineCount - readConfig.chunkSize);
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
        lineStart: Math.max(0, start),
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

  function onDropFile(event: DragEvent) {
    event.preventDefault();

    if (event.dataTransfer?.items) {
      [...event.dataTransfer.items].forEach((item) => {
        if (item.kind !== "file") {
          return;
        }
        file = item.getAsFile();
      });
    } else {
      [...(event.dataTransfer?.files ?? [])].forEach((_file, i) => {
        file = _file;
      });
    }

    if (!file) {
      return;
    }

    // 状態リセット
    cache.clear();
    inflight.clear();
    pendingBlockStart = -1;
    renderStart = 0;
    lineCurrent = 0;
    visibleLines = [];
    viewer?.scrollTo({ top: 0 });

    // インデックス作成
    worker.postMessage({
      messageType: MessageTypeEnum.enum.CreateIndex,
      file,
      encoding: "utf-16le",
    } as ReaderWorkerMessageType.CreateIndex);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  const scheduleScroll = rafSchd((top: number) => {
    const newStart = clamp(floor(top / lineHeight), 0, Math.max(0, lineCount - 1));
    if (newStart !== lineCurrent) {
      lineCurrent = newStart;
      if (block !== pendingBlockStart && block !== renderStart) {
        read(block);
      }
    }
  });

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
  <div class="mockup-browser border-base-300 border w-full h-full flex flex-col">
    <div class="mockup-browser-toolbar">
      <div class="ml-auto">{file?.name}</div>
    </div>
    {@render border()}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={viewer}
      bind:clientHeight={viewerClientHeight}
      class="grow overflow-auto"
      ondrop={onDropFile}
      ondragover={onDragOver}
      onscroll={onScrollViewer}
    >
      <div class="mx-3 relative" style:height={`${Math.max(1, lineCount) * lineHeight}px`}>
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
    </div>
    {@render border()}
    <div class="p-2 flex">
      <div class="grow"></div>
      {progressText}
    </div>
  </div>
</main>
