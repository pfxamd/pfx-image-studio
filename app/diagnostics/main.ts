import { studioReleaseLabel } from '../release.js';
import { runPhoneDiagnostics, type PhoneDiagnosticReport } from './runner.js';
import './style.css';

function element<T extends HTMLElement>(id: string): T {
  const item = document.getElementById(id);
  if (!item) throw new Error('Missing diagnostics element: ' + id);
  return item as T;
}
const start = element<HTMLButtonElement>('start');
const stop = element<HTMLButtonElement>('stop');
const copy = element<HTMLButtonElement>('copy');
const save = element<HTMLButtonElement>('save');
const status = element<HTMLElement>('status');
const counter = element<HTMLElement>('counter');
const progress = element<HTMLProgressElement>('progress');
const summary = element<HTMLElement>('summary');
const report = element<HTMLElement>('report');
const badge = element<HTMLElement>('badge');
element<HTMLElement>('version').textContent = studioReleaseLabel;

let controller: AbortController | undefined;
let reportText = '';

function metric(label: string, value: string): string {
  return '<div><dt>' + label + '</dt><dd>' + value + '</dd></div>';
}

function render(result: PhoneDiagnosticReport): void {
  const frames = result.responsiveness;
  const memory = result.memory;
  // Diagnostic values are locally generated numeric data; render labels
  // statically and output values only through textContent where possible.
  const stats = document.createElement('dl');
  stats.className = 'metrics';
  stats.innerHTML =
    metric('Total processing', result.totalElapsedMs + ' ms') +
    metric('Frames during test', String(frames.animationFrames)) +
    metric('Longest frame gap', frames.longestFrameGapMs === null
      ? 'Not measurable' : frames.longestFrameGapMs + ' ms') +
    metric('JS heap after', memory.afterMiB === null ? 'Unavailable'
      : memory.afterMiB + ' MiB (partial)');
  const table = document.createElement('table');
  table.className = 'caseTable';
  const head = document.createElement('thead');
  head.innerHTML = '<tr><th scope="col">Workload</th><th scope="col">Time</th></tr>';
  table.append(head);
  const body = document.createElement('tbody');
  for (const sample of result.cases) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = sample.label + ' · ' + sample.source + ' → ' + sample.target +
      (sample.repetitions > 1 ? ' (' + sample.repetitions + ' images)' : '');
    const time = document.createElement('td');
    time.textContent = sample.totalMs + ' ms';
    row.append(name, time);
    body.append(row);
  }
  table.append(body);
  const info = document.createElement('p');
  info.className = 'notes';
  info.textContent = 'Browser: ' + result.platform.browser +
    ' · Main-thread gaps above 50 ms: ' + frames.gapsAbove50ms +
    '. Pixel memory figures are estimates, not actual peak RAM.';
  summary.replaceChildren(stats, table, info);
  badge.textContent = 'Completed';
  report.hidden = false;
  report.textContent = reportText;
}

function setBusy(busy: boolean): void {
  start.disabled = busy;
  stop.disabled = !busy;
  copy.disabled = busy || !reportText;
  save.disabled = busy || !reportText;
}

start.addEventListener('click', () => {
  if (controller) return;
  controller = new AbortController();
  reportText = '';
  report.hidden = true;
  report.textContent = '';
  summary.textContent = 'Running synthetic local image workloads…';
  badge.textContent = 'Running';
  progress.value = 0;
  counter.textContent = '0/13';
  setBusy(true);
  const current = controller;
  void runPhoneDiagnostics(current.signal, (done, total, label) => {
    status.textContent = label;
    progress.max = total;
    progress.value = done;
    counter.textContent = done + '/' + total;
  }).then(result => {
    reportText = JSON.stringify(result, null, 2);
    render(result);
    status.textContent = 'Diagnostic completed';
  }).catch((error: unknown) => {
    const aborted = current.signal.aborted;
    badge.textContent = aborted ? 'Stopped' : 'Failed';
    status.textContent = aborted ? 'Stopped by user' : 'Diagnostic failed';
    const message = error instanceof Error ? error.message : String(error);
    summary.textContent = aborted ? 'Test stopped; no result was claimed.' :
      'Test failed: ' + message + '. You can run it again.';
    if (!aborted) {
      reportText = JSON.stringify({
        release: studioReleaseLabel, result: 'failed',
        message, completed: progress.value, total: progress.max
      }, null, 2);
      report.hidden = false;
      report.textContent = reportText;
    }
  }).finally(() => {
    controller = undefined;
    setBusy(false);
  });
});

stop.addEventListener('click', () => {
  controller?.abort();
  stop.disabled = true;
  status.textContent = 'Stopping…';
});

copy.addEventListener('click', () => {
  if (!reportText) return;
  void navigator.clipboard.writeText(reportText).then(() => {
    status.textContent = 'Report copied. Paste it into the chat.';
  }).catch(() => {
    status.textContent = 'Clipboard unavailable. Use Save report.';
  });
});
save.addEventListener('click', () => {
  if (!reportText) return;
  const file = new Blob([reportText], { type:'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pfx-studio-device-diagnostic.json';
  link.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
});
