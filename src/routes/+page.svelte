<script lang="ts">
  let file: File | null = $state(null);

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
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
  }
</script>

<main class="p-3 h-screen">
  <div class="mockup-browser border-base-300 border w-full h-full">
    <div class="mockup-browser-toolbar">
      <div class="ml-auto">{file?.name}</div>
    </div>
    <div class="border-t border-base-300"></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="grid place-content-center h-full" ondrop={onDropFile} ondragover={onDragOver}>Hello!</div>
  </div>
</main>
