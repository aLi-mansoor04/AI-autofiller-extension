// ApplyPilot Background Service Worker (Manifest V3)
const INITIAL_DATA = {
  applypilot_profile: {
    personal: {
      firstName: '',
      lastName: '',
      fullName: '',
      email: '',
      phone: '',
      city: '',
      state: '',
      country: '',
      pincode: ''
    },
    links: {
      linkedin: '',
      github: '',
      portfolio: '',
      twitter: ''
    },
    education: [
      {
        institution: '',
        degree: '',
        field: '',
        startYear: '',
        endYear: '',
        gpa: ''
      }
    ],
    work: {
      currentCompany: '',
      currentTitle: '',
      yearsExperience: '',
      noticePeriod: '',
      expectedSalary: ''
    },
    preferences: {
      willingToRelocate: '',
      workAuthorization: ''
    }
  },
  applypilot_masterResume: {
    header: { name: '', email: '', phone: '', links: [] },
    summary: '',
    skills: { languages: [], frameworks: [], tools: [], concepts: [] },
    education: [],
    experience: [],
    projects: [],
    certifications: [],
    achievements: []
  },
  applypilot_settings: {
    llmProvider: 'simulation',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    maxProjects: 3,
    template: 'classic',
    overwriteExisting: false,
    highlightDuration: 2500
  },
  applypilot_applications: []
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['applypilot_profile'], (res) => {
    if (!res.applypilot_profile) {
      chrome.storage.local.set(INITIAL_DATA, () => {
        console.log('ApplyPilot initialized with an empty profile.');
      });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (command === 'fill-page') {
    chrome.tabs.sendMessage(tab.id, { type: 'APPLYPILOT_TRIGGER_AUTOFILL' });
  } else if (command === 'tailor-resume') {
    chrome.tabs.sendMessage(tab.id, { type: 'APPLYPILOT_EXTRACT_JD' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'APPLYPILOT_TAILOR_LLM') {
    handleTailorLLM(message.jdText, message.company, message.role)
      .then((res) => sendResponse({ success: true, data: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleTailorLLM(jdText, company, role) {
  const storage = await chrome.storage.local.get(['applypilot_masterResume', 'applypilot_settings']);
  const resume = storage.applypilot_masterResume || INITIAL_DATA.applypilot_masterResume;
  const settings = storage.applypilot_settings || INITIAL_DATA.applypilot_settings;

  if (!settings.apiKey || settings.llmProvider === 'simulation') {
    return { tailoredResume: JSON.parse(JSON.stringify(resume)), mode: 'local_simulation' };
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || 'llama-3.3-70b-versatile',
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are ApplyPilot ATS Resume Tailor. You may ONLY reword, reorder, and emphasize information that exists in the provided resume. Do NOT add any skill, tool, metric, employer, or date not present in the source. Return JSON in the exact same schema as the input resume.'
        },
        {
          role: 'user',
          content: `Target Role: ${role} at ${company}\nJob Description:\n${jdText.slice(0, 6000)}\n\nMaster Resume JSON:\n${JSON.stringify(resume)}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Groq API Error (${response.status})`);
  }

  const data = await response.json();
  const tailoredResume = JSON.parse(data.choices[0].message.content);
  return { tailoredResume, mode: 'groq_api' };
}
