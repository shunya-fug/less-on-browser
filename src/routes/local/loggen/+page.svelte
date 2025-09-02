<script lang="ts">
  import { LogGenRequestSchema, SizeUnitEnum, LogFormatEnum, NewlineEnum } from "$lib/schemas/LogGenRequest";
  import { z } from "zod";

  let format: z.infer<typeof LogFormatEnum> = "apache-combined";
  let size = 50; // numeric value
  let sizeUnit: z.infer<typeof SizeUnitEnum> = "MB";
  let maxLineLength = 4096;
  let newline: z.infer<typeof NewlineEnum> = "\n";
  import { DelimiterEnum } from "$lib/schemas/LogGenRequest";
  let delimiter: z.infer<typeof DelimiterEnum> = "space";
  let seed: number | "" = "";
  let largeLineRatio = 0.02;
  let pattern = '{host} {ident} {user} [{time}] "{request}" {status} {bytes} "{referrer}" "{agent}"';

  let busy = false;
  let progress = "";
  let errorText: string | null = null;

  function defaultPatternFor(f: z.infer<typeof LogFormatEnum>): string {
    switch (f) {
      case "apache-common":
        return '{host} {ident} {user} [{time}] "{request}" {status} {bytes}';
      case "apache-combined":
        return '{host} {ident} {user} [{time}] "{request}" {status} {bytes} "{referrer}" "{agent}"';
      case "tomcat-access":
        return '{host} {ident} {user} [{time}] "{request}" {status} {bytes} {responseTimeMs}';
      case "custom":
        return pattern;
    }
  }

  function download() {
    return doDownload();
  }

  async function doDownload() {
    busy = true;
    errorText = null;
    progress = "生成開始...";
    try {
      const input = {
        format,
        size: Number(size),
        sizeUnit,
        maxLineLength: Number(maxLineLength),
        newline,
        delimiter,
        seed: seed === "" ? undefined : Number(seed),
        largeLineRatio: Number(largeLineRatio),
        pattern: format === "custom" ? pattern : undefined,
      };
      const parsed = LogGenRequestSchema.parse(input);

      const res = await fetch("/local/loggen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="?([^";]+)"?/i);
      const filename = m?.[1] ?? "dummy.log";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      progress = "完了";
    } catch (e) {
      console.error(e);
      errorText = "入力に誤りがあります。値を確認してください。";
      progress = "エラー";
    } finally {
      busy = false;
    }
  }
</script>

<div class="p-5 max-w-3xl mx-auto space-y-6">
  <h1 class="text-2xl font-bold">ダミーログ生成 (ローカル)</h1>
  <div class="card bg-base-200 shadow">
    <div class="card-body space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="form-control">
          <div class="label"><span class="label-text">フォーマット</span></div>
          <select class="select select-bordered" bind:value={format}>
            <option value="apache-common">Apache Common</option>
            <option value="apache-combined">Apache Combined</option>
            <option value="tomcat-access">Tomcat Access</option>
            <option value="custom">カスタム</option>
          </select>
        </label>

        <div class="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
          <label class="form-control">
            <div class="label"><span class="label-text">出力サイズ</span></div>
            <input type="number" class="input input-bordered" min="1" bind:value={size} />
          </label>
          <label class="form-control">
            <div class="label"><span class="label-text">単位</span></div>
            <select class="select select-bordered" bind:value={sizeUnit}>
              <option>B</option>
              <option>KB</option>
              <option selected>MB</option>
              <option>GB</option>
            </select>
          </label>
        </div>

        <label class="form-control">
          <div class="label"><span class="label-text">1行の最大文字数</span></div>
          <input type="number" class="input input-bordered" min="0" bind:value={maxLineLength} />
          <div class="label"><span class="label-text-alt">0 で無効化。大きな行は確率的に生成されます。</span></div>
        </label>

        <label class="form-control">
          <div class="label"><span class="label-text">改行コード</span></div>
          <select class="select select-bordered" bind:value={newline}>
            <option value="\n">LF (\n)</option>
            <option value="\r\n">CRLF (\r\n)</option>
          </select>
        </label>

        <label class="form-control">
          <div class="label"><span class="label-text">区切り文字</span></div>
          <select class="select select-bordered" bind:value={delimiter}>
            <option value="space">Space</option>
            <option value="tab">Tab</option>
            <option value="comma">Comma (,)</option>
            <option value="pipe">Pipe (|)</option>
          </select>
        </label>

        <label class="form-control">
          <div class="label"><span class="label-text">乱数 Seed (任意)</span></div>
          <input
            type="number"
            class="input input-bordered"
            min="1"
            bind:value={seed}
            placeholder="未指定で毎回ランダム"
          />
        </label>

        <label class="form-control">
          <div class="label"><span class="label-text">大きな行の割合</span></div>
          <input type="range" min="0" max="1" step="0.01" bind:value={largeLineRatio} />
          <div class="label"><span class="label-text-alt">{Math.round(largeLineRatio * 100)}%</span></div>
        </label>
      </div>

      <label class="form-control">
        <div class="label">
          <span class="label-text">パターン</span>
          {#if format !== "custom"}
            <span class="label-text-alt">（表示のみ）</span>
          {/if}
        </div>
        {#if format === "custom"}
          <textarea class="textarea textarea-bordered font-mono" rows="3" bind:value={pattern}></textarea>
        {:else}
          <textarea class="textarea textarea-bordered font-mono" rows="3" readonly>{defaultPatternFor(format)}</textarea
          >
        {/if}
        <div class="label">
          <span class="label-text-alt">
            利用可能な変数: {`{host} {ident} {user} {time} {request} {status} {bytes} {referrer} {agent} {responseTimeMs}`}
          </span>
        </div>
      </label>

      <div class="card-actions justify-end">
        <button class="btn btn-primary" disabled={busy} onclick={download}>
          {busy ? "生成中..." : "ダウンロード"}
        </button>
        <span class="opacity-70">{progress}</span>
        {#if errorText}
          <span class="text-error">{errorText}</span>
        {/if}
      </div>
    </div>
  </div>
</div>
