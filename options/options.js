let currentProfileObj = {};

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['applypilot_profile', 'applypilot_masterResume', 'applypilot_settings'], (res) => {
    const p = res.applypilot_profile || {};
    currentProfileObj = p;

    document.getElementById('f-firstName').value = p.personal?.firstName || '';
    document.getElementById('f-lastName').value = p.personal?.lastName || '';
    document.getElementById('f-email').value = p.personal?.email || '';
    document.getElementById('f-phone').value = p.personal?.phone || '';
    document.getElementById('f-city').value = p.personal?.city || '';
    document.getElementById('f-country').value = p.personal?.country || '';
    document.getElementById('f-linkedin').value = p.links?.linkedin || '';
    document.getElementById('f-github').value = p.links?.github || '';
    document.getElementById('f-portfolio').value = p.links?.portfolio || '';
    document.getElementById('f-college').value = p.education?.[0]?.institution || '';
    document.getElementById('f-degree').value = p.education?.[0]?.degree || '';
    document.getElementById('f-gradYear').value = p.education?.[0]?.endYear || '';
    document.getElementById('f-company').value = p.work?.currentCompany || '';
    document.getElementById('f-title').value = p.work?.currentTitle || '';
    document.getElementById('f-yoe').value = p.work?.yearsExperience || '';
    document.getElementById('f-salary').value = p.work?.expectedSalary || '';

    if (res.applypilot_masterResume) {
      document.getElementById('resume-json').value = JSON.stringify(res.applypilot_masterResume, null, 2);
    }
    if (res.applypilot_settings) {
      document.getElementById('api-key').value = res.applypilot_settings.apiKey || '';
      document.getElementById('model-name').value = res.applypilot_settings.model || 'llama-3.3-70b-versatile';
    }
  });

  // Auto-convert plain text resume using Groq API
  document.getElementById('convert-resume-btn').addEventListener('click', async () => {
    const rawText = document.getElementById('raw-resume-text').value.trim();
    const apiKey = document.getElementById('api-key').value.trim();
    const statusEl = document.getElementById('convert-status');

    if (!rawText) {
      alert('Please paste your resume text first!');
      return;
    }
    if (!apiKey) {
      alert('Please enter your free Groq API Key in Box #1 first so AI can convert your resume text to JSON!');
      return;
    }

    statusEl.textContent = '⏳ Converting with Groq AI...';
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: document.getElementById('model-name').value.trim() || 'llama-3.3-70b-versatile',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'Convert the user plain text resume into this exact JSON schema: {"header":{"name":"","email":"","phone":"","links":[]},"summary":"","skills":{"languages":[],"frameworks":[],"tools":[],"concepts":[]},"education":[{"institution":"","degree":"","dates":"","details":[]}],"experience":[{"id":"exp1","company":"","role":"","dates":"","bullets":[""]}],"projects":[{"id":"proj1","name":"","techStack":[],"link":"","bullets":[""]}],"certifications":[],"achievements":[]}. Return ONLY valid JSON.'
            },
            { role: 'user', content: rawText }
          ]
        })
      });
      if (!response.ok) throw new Error('Groq API error ' + response.status);
      const data = await response.json();
      const parsed = JSON.parse(data.choices[0].message.content);
      document.getElementById('resume-json').value = JSON.stringify(parsed, null, 2);
      statusEl.textContent = '✓ Converted to JSON! Now click Save below.';
    } catch (err) {
      statusEl.textContent = '❌ Error: ' + err.message;
    }
  });

  document.getElementById('save-btn').addEventListener('click', () => {
    try {
      const firstName = document.getElementById('f-firstName').value.trim();
      const lastName = document.getElementById('f-lastName').value.trim();
      const updatedProfile = {
        ...currentProfileObj,
        personal: {
          ...(currentProfileObj.personal || {}),
          firstName,
          lastName,
          fullName: (firstName + ' ' + lastName).trim(),
          email: document.getElementById('f-email').value.trim(),
          phone: document.getElementById('f-phone').value.trim(),
          city: document.getElementById('f-city').value.trim(),
          country: document.getElementById('f-country').value.trim()
        },
        links: {
          ...(currentProfileObj.links || {}),
          linkedin: document.getElementById('f-linkedin').value.trim(),
          github: document.getElementById('f-github').value.trim(),
          portfolio: document.getElementById('f-portfolio').value.trim()
        },
        education: [
          {
            institution: document.getElementById('f-college').value.trim(),
            degree: document.getElementById('f-degree').value.trim(),
            field: currentProfileObj.education?.[0]?.field || 'Computer Science',
            startYear: '',
            endYear: document.getElementById('f-gradYear').value.trim(),
            gpa: currentProfileObj.education?.[0]?.gpa || ''
          }
        ],
        work: {
          ...(currentProfileObj.work || {}),
          currentCompany: document.getElementById('f-company').value.trim(),
          currentTitle: document.getElementById('f-title').value.trim(),
          yearsExperience: document.getElementById('f-yoe').value.trim(),
          expectedSalary: document.getElementById('f-salary').value.trim()
        }
      };

      const resume = JSON.parse(document.getElementById('resume-json').value);
      const settings = {
        llmProvider: document.getElementById('api-key').value.trim() ? 'groq' : 'simulation',
        apiKey: document.getElementById('api-key').value.trim(),
        model: document.getElementById('model-name').value.trim() || 'llama-3.3-70b-versatile'
      };
      chrome.storage.local.set({
        applypilot_profile: updatedProfile,
        applypilot_masterResume: resume,
        applypilot_settings: settings
      }, () => {
        const msg = document.getElementById('save-msg');
        msg.textContent = '✓ Saved successfully!';
        setTimeout(() => msg.textContent = '', 3000);
      });
    } catch (e) {
      alert('Invalid Resume JSON format: ' + e.message);
    }
  });
});
