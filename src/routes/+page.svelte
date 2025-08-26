<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { MessageTypeEnum } from "$lib/schemas/ReaderWorkerMessage";
  import * as ReaderWorkerMessageType from "$lib/types/ReaderWorkerMessage";

  const LINES_PER_READ = 200;

  let worker: Worker;
  let file: File | null = $state(null);
  let progressText = $state("ファイル未選択");
  let lineCount = $state(0);
  let lineCurrent = $state(0);
  let visibleLines: string[] = $state([]);
  let viewer: HTMLDivElement;
  let lineHeight = 20;

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
          const percent = ((message.doneBytes / message.fileSize) * 100).toFixed(1);
          progressText = `ファイル読込中: ${percent}% (${message.doneBytes} / ${message.fileSize} バイト)`;
          break;

        // ファイル読込完了
        case MessageTypeEnum.enum.CreateIndexResult:
          lineCount = message.lineCount;
          progressText = `読込完了: ${lineCount} 行`;
          read(0);
          break;

        // 読取結果
        case MessageTypeEnum.enum.ReadResult:
          if (message.lineStart === lineCurrent) {
            visibleLines = message.lines;
          }
          break;
      }
    };
  }

  function read(startLine: number) {
    worker.postMessage({
      messageType: MessageTypeEnum.enum.Read,
      lineStart: Math.max(0, startLine),
      count: LINES_PER_READ,
    } as ReaderWorkerMessageType.Read);
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

    worker.postMessage({
      messageType: MessageTypeEnum.enum.CreateIndex,
      file,
      encoding: "utf-16le",
    } as ReaderWorkerMessageType.CreateIndex);
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function onScrollViewer() {
    const top = viewer.scrollTop;
    const newStart = Math.floor(top / lineHeight);
    if (newStart !== lineCurrent) {
      lineCurrent = newStart;
      read(lineCurrent);
    }
  }

  onMount(() => {
    initWorker();
  });

  onDestroy(() => {
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
      class="grow overflow-auto"
      ondrop={onDropFile}
      ondragover={onDragOver}
      onscroll={onScrollViewer}
    >
      <div class="mx-3 relative" style:height={`${Math.max(1, lineCount) * lineHeight}px`}>
        <div
          class="absolute will-change-transform top-0 inset-x-0"
          style:transform={`translateY(${lineCurrent * lineHeight}px)`}
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
