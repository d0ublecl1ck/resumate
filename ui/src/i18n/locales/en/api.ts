// Copy returned by the heuristic parsers: field labels and notes for basics / JD / fact drafts.
export default {
  basics: {
    fields: {
      email: "Email",
      phone: "Phone",
      location: "City",
      headline: "Headline",
      fullName: "Name",
    },
    note: "Detected as changes to your basic info. They take effect immediately once confirmed and do not affect your experience or skill entries.",
  },
  jd: {
    extracted: {
      role: "Role",
      company: "Company",
      source: "Source",
    },
    tags: {
      frontend: "Frontend",
      backend: "Backend",
      performance: "Performance optimization",
      team: "Team",
      cEnd: "Consumer-facing",
      architecture: "Architecture",
    },
    note: {
      image: "Content recognized from the screenshot. Please review before creating.",
      text: "Extracted the role, company and tags from the pasted text. Please review before creating.",
      imageDemo: "Recognized the following content from the screenshot “{{fileName}}” (sample data for demo). Please review before creating.",
    },
  },
  fact: {
    extracted: {
      time: "Time",
      type: "Type",
    },
    types: {
      achievement: "Achievement",
      certificate: "Certificate",
      education: "Education",
      project: "Project",
      skill: "Skill",
      experience: "Experience",
    },
    typeDefault: "Experience (default)",
    untitled: "Untitled fact",
    note: {
      update: "Detected as a supplementary update to the existing fact “{{title}}”. Once confirmed, the content will be merged and the evidence status will remain unverified.",
      create: "Detected as a new fact. Content entered in natural language defaults to “unverified”; you can upload evidence after confirming and then mark it as verified.",
    },
  },
}
