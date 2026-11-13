// ApplyPilot Content Script — Real DOM Autofill & JD Extractor
(function() {
  if (window.__applyPilotInjected) return;
  window.__applyPilotInjected = true;

  // Inject highlight styles
  const style = document.createElement('style');
  style.textContent = `
    .applypilot-filled {
      outline: 2px solid #22c55e !important;
      background-color: rgba(34, 197, 94, 0.06) !important;
      transition: all 0.3s ease;
    }
    .applypilot-uncertain {
      outline: 2px dashed #f59e0b !important;
    }
    #applypilot-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #0284c7;
      border-radius: 10px;
      padding: 12px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 10px;
    }
  `;
  document.head.appendChild(style);

  function showToast(msg) {
    const existing = document.getElementById('applypilot-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'applypilot-toast';
    toast.textContent = '⚡ ApplyPilot: ' + msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function setNativeValue(el, value) {
    const strVal = String(value);
    if (el.tagName === 'SELECT') {
      const target = normalize(strVal);
      for (const opt of el.options) {
        const optText = normalize(opt.text);
        const optVal = normalize(opt.value);
        if (optText === target || optVal === target || (optText && optText.includes(target))) {
          el.value = opt.value;
          break;
        }
      }
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = ['true', 'yes', '1'].includes(normalize(strVal));
    } else {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, strVal);
      } else {
        el.value = strVal;
      }
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function getFieldSignal(el) {
    let labelText = '';
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) labelText = lbl.textContent;
    }
    if (!labelText) {
      const parentLbl = el.closest('label');
      if (parentLbl) labelText = parentLbl.textContent;
    }
    if (!labelText) {
      const group = el.closest('.field, .form-group, [class*="field"], [class*="input"]');
      if (group) {
        const lbl = group.querySelector('label, .label, span');
        if (lbl) labelText = lbl.textContent;
      }
    }
    return normalize([
      labelText,
      el.getAttribute('aria-label'),
      el.placeholder,
      el.name,
      el.id,
      el.getAttribute('autocomplete')
    ].filter(Boolean).join(' '));
  }

  function matchSignalToProfile(signal, p) {
    if (!signal || !p) return null;
    const rules = [
      { rx: /\b(first name|given name|fname|first_name)\b/, val: p.personal?.firstName },
      { rx: /\b(last name|family name|surname|lname|last_name)\b/, val: p.personal?.lastName },
      { rx: /\b(full name|your name|candidate name|applicant name|^name$)\b/, val: p.personal?.fullName },
      { rx: /\b(email|e mail)\b/, val: p.personal?.email },
      { rx: /\b(phone|mobile|cell|telephone|contact number)\b/, val: p.personal?.phone },
      { rx: /\b(linkedin)\b/, val: p.links?.linkedin },
      { rx: /\b(github)\b/, val: p.links?.github },
      { rx: /\b(portfolio|website|personal site|blog)\b/, val: p.links?.portfolio },
      { rx: /\b(twitter|x handle)\b/, val: p.links?.twitter },
      { rx: /\b(city|current city|town)\b/, val: p.personal?.city },
      { rx: /\b(state|province)\b/, val: p.personal?.state },
      { rx: /\b(country)\b/, val: p.personal?.country },
      { rx: /\b(zip|postal|pincode)\b/, val: p.personal?.pincode },
      { rx: /\b(college|university|school|institution|alma mater)\b/, val: p.education?.[0]?.institution },
      { rx: /\b(degree|qualification)\b/, val: p.education?.[0]?.degree },
      { rx: /\b(major|field of study|discipline|branch)\b/, val: p.education?.[0]?.field },
      { rx: /\b(graduation year|passing year|grad year|end year)\b/, val: p.education?.[0]?.endYear },
      { rx: /\b(gpa|cgpa|grade)\b/, val: p.education?.[0]?.gpa },
      { rx: /\b(current company|current employer|employer)\b/, val: p.work?.currentCompany },
      { rx: /\b(current title|job title|designation|current role)\b/, val: p.work?.currentTitle },
      { rx: /\b(years of experience|total experience|yoe)\b/, val: p.work?.yearsExperience },
      { rx: /\b(notice period|availability|how soon)\b/, val: p.work?.noticePeriod },
      { rx: /\b(expected salary|desired salary|compensation|expected ctc)\b/, val: p.work?.expectedSalary },
      { rx: /\b(relocate|relocation)\b/, val: p.preferences?.willingToRelocate },
      { rx: /\b(authorized|authorization|sponsorship|visa)\b/, val: p.preferences?.workAuthorization }
    ];

    for (const rule of rules) {
      if (rule.rx.test(signal) && rule.val) {
        return rule.val;
      }
    }
    return null;
  }

  function runAutofill(profile, settings = {}) {
    const inputs = document.querySelectorAll(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="file"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
    );
    let filled = 0;
    let skipped = 0;
    let uncertain = 0;

    inputs.forEach((el) => {
      if (el.offsetParent === null) return; // skip hidden elements
      if (!settings.overwriteExisting && el.value && el.value.trim().length > 0 && el.type !== 'checkbox' && el.type !== 'radio') {
        skipped++;
        return;
      }
      const signal = getFieldSignal(el);
      const val = matchSignalToProfile(signal, profile);
      if (val) {
        setNativeValue(el, val);
        el.classList.add('applypilot-filled');
        filled++;
      } else if (signal) {
        el.classList.add('applypilot-uncertain');
        uncertain++;
      }
    });

    showToast(`Filled ${filled} fields (${skipped} skipped, ${uncertain} uncertain)`);
    return { filled, skipped, uncertain };
  }

  function extractPageJD() {
    const sel = window.getSelection()?.toString()?.trim();
    if (sel && sel.length > 50) {
      return { text: sel, company: document.title.split(/[-|]/)[1]?.trim() || 'Company', role: document.querySelector('h1')?.innerText?.trim() || 'Role' };
    }
    const selectors = ['#content', '#job_description', '.job__description', '.posting-description', '[data-test="JobDescription"]', 'main', 'article'];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.trim().length > 150) {
        return {
          text: el.innerText.trim().slice(0, 8000),
          company: document.title.split(/[-|at]/).pop()?.trim() || 'Company',
          role: document.querySelector('h1, h2')?.innerText?.trim() || 'Software Engineer'
        };
      }
    }
    return {
      text: document.body.innerText.trim().slice(0, 6000),
      company: 'Target Company',
      role: document.title || 'Software Engineer'
    };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'APPLYPILOT_TRIGGER_AUTOFILL') {
      chrome.storage.local.get(['applypilot_profile', 'applypilot_settings'], (res) => {
        const stats = runAutofill(res.applypilot_profile, res.applypilot_settings);
        sendResponse({ status: 'ok', stats });
      });
      return true;
    }
    if (msg.type === 'APPLYPILOT_EXTRACT_JD') {
      const jd = extractPageJD();
      sendResponse({ status: 'ok', jd });
      return true;
    }
  });
})();
