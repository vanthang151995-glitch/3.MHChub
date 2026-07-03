import { sanitizeSpreadsheetHtml } from "../server/core/documentPreviewService.js";

const assert = (condition, message, evidence = {}) => {
  if (condition) return;
  const error = new Error(message);
  error.evidence = evidence;
  throw error;
};

const input = `
<!doctype html>
<html>
  <head>
    <base href="https://attacker.invalid/">
    <meta http-equiv="refresh" content="0;url=javascript:alert(1)">
    <style>.cell { color: #123456; }</style>
    <script>alert("x")</script>
  </head>
  <body onload="steal()">
    <table style="border-collapse:collapse">
      <tr onclick="steal()"><td class="cell" style="font-weight:bold">Merged cell</td></tr>
      <tr><td><a href="javascript:alert(1)">bad link</a></td></tr>
      <tr><td><a href="&#x6a;avascript&#x3a;alert(2)">encoded bad link</a></td></tr>
      <tr><td><img src="data:image/png;base64,abc" onerror="steal()"></td></tr>
      <tr><td><img src="vbscript:msgbox(1)"></td></tr>
      <tr><td><img srcset="data:text/html;base64,PHNjcmlwdA== 1x, javascript:alert(1) 2x"></td></tr>
      <tr><td><form action="/submit"><span>keep text</span><input name="x"></form></td></tr>
      <tr><td><iframe srcdoc="<script>alert(1)</script>"></iframe></td></tr>
    </table>
  </body>
</html>`;

const output = sanitizeSpreadsheetHtml(input);

assert(!/<script\b/i.test(output), "script tag was not removed", { output });
assert(!/<iframe\b/i.test(output), "iframe tag was not removed", { output });
assert(!/<base\b/i.test(output), "base tag was not removed", { output });
assert(!/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(output), "meta refresh tag was not removed", { output });
assert(!/\son[a-z]+\s*=/i.test(output), "inline event handler was not removed", { output });
assert(!/(href|src|xlink:href|action|formaction|srcdoc)\s*=\s*["']?\s*(?:javascript|vbscript|data(?!:image\/))/i.test(output), "dangerous URL attribute remains", {
  output
});
assert(!/\ssrcset\s*=/i.test(output), "dangerous srcset attribute remains", { output });
assert(/<style>/.test(output) && /style="border-collapse:collapse"/.test(output), "safe style content should be preserved", { output });
assert(/Merged cell/.test(output) && /keep text/.test(output), "spreadsheet text should be preserved", { output });
assert(/src="data:image\/png;base64,abc"/.test(output), "safe data:image source should be preserved", { output });

console.log(
  JSON.stringify(
    {
      ok: true,
      removedActiveContent: true,
      preservedTableText: true,
      preservedStyles: true
    },
    null,
    2
  )
);
