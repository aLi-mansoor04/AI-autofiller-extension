const statusBox = document.getElementById('status-box');
const jdPanel = document.getElementById('jd-panel');
const outputPanel = document.getElementById('output-panel');
let latestTailoredResume = null;

function showStatus(text, color = '#38bdf8') {
  statusBox.style.display = 'block';
  statusBox.style.color = color;
  statusBox.textContent = text;
}

function formatResumeToText(r) {
  const lines = [];
  lines.push((r.header?.name || 'Candidate Name').toUpperCase());
  lines.push([r.header?.email, r.header?.phone, ...(r.header?.links || [])].filter(Boolean).join(' | '));
  lines.push('');
  if (r.summary) {
    lines.push('PROFESSIONAL SUMMARY');
    lines.push(r.summary);
    lines.push('');
  }
  if (r.skills) {
    lines.push('TECHNICAL SKILLS');
    if (r.skills.languages?.length) lines.push('Languages: ' + r.skills.languages.join(', '));
    if (r.skills.frameworks?.length) lines.push('Frameworks: ' + r.skills.frameworks.join(', '));
    if (r.skills.tools?.length) lines.push('Tools: ' + r.skills.tools.join(', '));
    lines.push('');
  }
  if (r.experience?.length) {
    lines.push('WORK EXPERIENCE');
    r.experience.forEach((e) => {
      lines.push(`${e.company} — ${e.role} (${e.dates || ''})`);
      (e.bullets || []).forEach((b) => lines.push('• ' + b));
      lines.push('');
    });
  }
  if (r.projects?.length) {
    lines.push('PROJECTS');
    r.projects.forEach((p) => {
      lines.push(`${p.name} [${(p.techStack || []).join(', ')}]`);
      (p.bullets || []).forEach((b) => lines.push('• ' + b));
      lines.push('');
    });
  }
  return lines.join('\n');
}

document.getElementById('autofill-btn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  showStatus('Scanning page fields...');
  chrome.tabs.sendMessage(tab.id, { type: 'APPLYPILOT_TRIGGER_AUTOFILL' }, (res) => {
    if (chrome.runtime.lastError) {
      showStatus('Please refresh the job page once after installing ApplyPilot.', '#f59e0b');
      return;
    }
    if (res?.stats) {
      showStatus(`✓ Filled ${res.stats.filled} fields (${res.stats.skipped} skipped, ${res.stats.uncertain} uncertain)`, '#34d399');
    }
  });
});

document.getElementById('extract-jd-btn')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'APPLYPILOT_EXTRACT_JD' }, (res) => {
    if (chrome.runtime.lastError || !res?.jd) {
      jdPanel.style.display = 'block';
      showStatus('Paste the Job Description below to tailor.', '#f59e0b');
      return;
    }
    jdPanel.style.display = 'block';
    document.getElementById('jd-company').value = res.jd.company || '';
    document.getElementById('jd-role').value = res.jd.role || '';
    document.getElementById('jd-text').value = res.jd.text || '';
    showStatus('JD extracted! Review and click Run AI Tailoring.', '#34d399');
  });
});

document.getElementById('run-tailor-btn')?.addEventListener('click', () => {
  const jdText = document.getElementById('jd-text').value;
  const company = document.getElementById('jd-company').value;
  const role = document.getElementById('jd-role').value;
  showStatus('⏳ Tailoring resume with Groq AI + Hallucination Guard...');
  chrome.runtime.sendMessage(
    { type: 'APPLYPILOT_TAILOR_LLM', jdText, company, role },
    (res) => {
      if (res?.success && res?.data?.tailoredResume) {
        latestTailoredResume = res.data.tailoredResume;
        outputPanel.style.display = 'block';
        document.getElementById('tailored-output-text').value = formatResumeToText(latestTailoredResume);
        showStatus('✓ Tailoring complete! View, copy, or save as PDF below.', '#34d399');
      } else {
        showStatus('Error: ' + (res?.error || 'Failed to tailor'), '#f43f5e');
      }
    }
  );
});

document.getElementById('copy-output-btn')?.addEventListener('click', () => {
  const text = document.getElementById('tailored-output-text').value;
  navigator.clipboard.writeText(text);
  showStatus('✓ Copied full tailored resume to clipboard!', '#34d399');
});

document.getElementById('download-pdf-btn')?.addEventListener('click', () => {
  if (!latestTailoredResume) return;
  const r = latestTailoredResume;
  const company = (document.getElementById('jd-company').value || 'Company').replace(/[^a-zA-Z0-9]/g, '');
  const role = (document.getElementById('jd-role').value || 'Role').replace(/[^a-zA-Z0-9]/g, '');
  const titleName = `${(r.header?.name || 'Candidate').replace(/\s+/g, '_')}_${company}_${role}`;

  const printWin = window.open('', '_blank');
  printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${titleName}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: Helvetica, Arial, sans-serif; color: #0f172a; font-size: 10pt; line-height: 1.35; margin: 0; }
    h1 { text-align: center; font-size: 18pt; margin: 0 0 4px; }
    .contact { text-align: center; font-size: 9pt; color: #475569; margin-bottom: 12px; }
    h2 { font-size: 10.5pt; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; margin: 10px 0 6px; }
    .row { display: flex; justify-content: space-between; font-weight: bold; margin-top: 6px; }
    ul { margin: 3px 0 8px 18px; padding: 0; }
    li { margin-bottom: 2px; }
  </style>
</head>
<body>
  <h1>${r.header?.name || ''}</h1>
  <div class="contact">${[r.header?.email, r.header?.phone, ...(r.header?.links || [])].filter(Boolean).join('  |  ')}</div>
  ${r.summary ? `<h2>Professional Summary</h2><p style="margin:0 0 8px;">${r.summary}</p>` : ''}
  <h2>Technical Skills</h2>
  <div>
    ${r.skills?.languages?.length ? `<div><b>Languages:</b> ${r.skills.languages.join(', ')}</div>` : ''}
    ${r.skills?.frameworks?.length ? `<div><b>Frameworks:</b> ${r.skills.frameworks.join(', ')}</div>` : ''}
    ${r.skills?.tools?.length ? `<div><b>Tools:</b> ${r.skills.tools.join(', ')}</div>` : ''}
  </div>
  ${r.experience?.length ? `<h2>Work Experience</h2>` + r.experience.map(e => `
    <div class="row"><span>${e.company} — ${e.role}</span><span>${e.dates || ''}</span></div>
    <ul>${(e.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
  `).join('') : ''}
  ${r.projects?.length ? `<h2>Selected Projects</h2>` + r.projects.map(p => `
    <div class="row"><span>${p.name}</span><span>[${(p.techStack || []).join(', ')}]</span></div>
    <ul>${(p.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
  `).join('') : ''}
  ${r.education?.length ? `<h2>Education</h2>` + r.education.map(ed => `
    <div class="row"><span>${ed.institution} — ${ed.degree}</span><span>${ed.dates || ''}</span></div>
  `).join('') : ''}
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
  printWin.document.close();
});

document.getElementById('options-btn')?.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
