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
      <tr><td style="border-bottom:1px solid #000" sdval="45839" sdnum="1033;0;M/D/YYYY"><font face="Times New Roman">7/1/2025</font></td></tr>
      <tr><td style="border-bottom:1px solid #000" sdval="45839.5" sdnum="1033;0;YYYY/MM/DD hh:mm"><font face="Times New Roman">2025/07/01 12:00</font></td></tr>
      <tr><td style="border-bottom:1px solid #000" sdval="0.193" sdnum="1033;0;0.00%"><font face="Times New Roman">19.30%</font></td></tr>
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
assert(/2025\/07\/01/.test(output), "spreadsheet date cells should be normalized to ISO format", { output });
assert(/2025\/07\/01 12:00/.test(output), "spreadsheet datetime cells should keep their time", { output });
assert(/19\.30%/.test(output), "spreadsheet percent cells should keep numeric formatting", { output });
assert(!/>7\/1\/2025<\/font>/.test(output), "raw locale-style spreadsheet date should be replaced", { output });

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
