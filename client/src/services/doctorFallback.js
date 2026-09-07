export const fallbackDoctorData = {
  dashboard: {
    stats: {
      todayAppointments: 12,
      pendingLabReports: 5,
      followUpPatients: 8,
      completedToday: 7,
    },
    appointments: [
      { id: "APT-001", patient: { id: "P1", name: "Ram Sharma", age: 45, gender: "Male" }, time: "09:00 AM", type: "General Consultation", status: "Waiting" },
      { id: "APT-002", patient: { id: "P2", name: "Sita Thapa", age: 32, gender: "Female" }, time: "09:30 AM", type: "Follow-up", status: "In Consultation" },
      { id: "APT-003", patient: { id: "P3", name: "Aarav Gurung", age: 28, gender: "Male" }, time: "10:00 AM", type: "New Visit", status: "Waiting" },
      { id: "APT-004", patient: { id: "P4", name: "Maya Rai", age: 54, gender: "Female" }, time: "10:30 AM", type: "General Consultation", status: "Completed" },
      { id: "APT-005", patient: { id: "P5", name: "Hari Karki", age: 61, gender: "Male" }, time: "11:00 AM", type: "Follow-up", status: "Waiting" },
    ],
  },

  appointments: [
    { id: "APT-001", patient: { id: "P1", name: "Ram Sharma", age: 45, gender: "Male" }, date: "2026-08-31", time: "09:00 AM", type: "General Consultation", status: "Waiting" },
    { id: "APT-002", patient: { id: "P2", name: "Sita Thapa", age: 32, gender: "Female" }, date: "2026-08-31", time: "09:30 AM", type: "Follow-up", status: "In Consultation" },
    { id: "APT-003", patient: { id: "P3", name: "Aarav Gurung", age: 28, gender: "Male" }, date: "2026-08-31", time: "10:00 AM", type: "New Visit", status: "Waiting" },
    { id: "APT-004", patient: { id: "P4", name: "Maya Rai", age: 54, gender: "Female" }, date: "2026-08-31", time: "10:30 AM", type: "General Consultation", status: "Completed" },
    { id: "APT-005", patient: { id: "P5", name: "Hari Karki", age: 61, gender: "Male" }, date: "2026-08-31", time: "11:00 AM", type: "Follow-up", status: "Scheduled" },
  ],

  patients: [
    { id: "P1", patientId: "PAT-1001", name: "Ram Sharma", age: 45, gender: "Male", bloodGroup: "B+", phone: "9800000001", allergies: ["Penicillin"], conditions: ["Hypertension"] },
    { id: "P2", patientId: "PAT-1002", name: "Sita Thapa", age: 32, gender: "Female", bloodGroup: "O+", phone: "9800000002", allergies: [], conditions: ["Diabetes"] },
    { id: "P3", patientId: "PAT-1003", name: "Aarav Gurung", age: 28, gender: "Male", bloodGroup: "A+", phone: "9800000003", allergies: [], conditions: [] },
    { id: "P4", patientId: "PAT-1004", name: "Maya Rai", age: 54, gender: "Female", bloodGroup: "AB+", phone: "9800000004", allergies: ["Sulfa"], conditions: ["Asthma"] },
    { id: "P5", patientId: "PAT-1005", name: "Hari Karki", age: 61, gender: "Male", bloodGroup: "O-", phone: "9800000005", allergies: [], conditions: ["Hyperlipidemia"] },
  ],

  consultations: [
    { id: "CON-001", patient: { id: "P1", name: "Ram Sharma", age: 45, gender: "Male" }, diagnosis: "Hypertension", clinicalNotes: "BP elevated; advised low-salt diet and medication.", createdAt: "2026-08-24", status: "Completed" },
    { id: "CON-002", patient: { id: "P2", name: "Sita Thapa", age: 32, gender: "Female" }, diagnosis: "Type 2 Diabetes", clinicalNotes: "Fasting sugar high; adjusted metformin dose.", createdAt: "2026-08-25", status: "Completed" },
    { id: "CON-003", patient: { id: "P4", name: "Maya Rai", age: 54, gender: "Female" }, diagnosis: "Bronchial Asthma", clinicalNotes: "Wheezing; prescribed inhaler.", createdAt: "2026-08-27", status: "Completed" },
  ],

  prescriptions: [
    { id: "RX-001", patient: { id: "P1", name: "Ram Sharma", age: 45, gender: "Male" }, diagnosis: "Hypertension", medicines: [{ name: "Amlodipine", dosage: "5 mg", frequency: "Once daily", duration: "30 days", instructions: "Take in the morning" }], created_at: "2026-08-24" },
    { id: "RX-002", patient: { id: "P2", name: "Sita Thapa", age: 32, gender: "Female" }, diagnosis: "Type 2 Diabetes", medicines: [{ name: "Metformin", dosage: "500 mg", frequency: "Twice daily", duration: "15 days", instructions: "Take after meals" }], created_at: "2026-08-25" },
  ],

  labRequests: [
    { id: "LR-001", patient: { id: "P1", name: "Ram Sharma" }, testName: "CBC", requestedDate: "2026-08-29", priority: "Normal", status: "Completed" },
    { id: "LR-002", patient: { id: "P2", name: "Sita Thapa" }, testName: "Blood Sugar", requestedDate: "2026-08-29", priority: "Urgent", status: "In Progress" },
    { id: "LR-003", patient: { id: "P4", name: "Maya Rai" }, testName: "Liver Function", requestedDate: "2026-08-30", priority: "Normal", status: "Pending" },
  ],

  labReports: [
    { id: "REP-001", patient: { id: "P1", name: "Ram Sharma" }, testName: "CBC", requestedDate: "2026-08-29", completedDate: "2026-08-30", status: "Completed", results: [
      { test: "Hemoglobin", result: "13.5", unit: "g/dL", referenceRange: "13–17 g/dL", flag: "normal" },
      { test: "WBC", result: "7,500", unit: "/µL", referenceRange: "4,000–11,000", flag: "normal" },
      { test: "Platelets", result: "250,000", unit: "/µL", referenceRange: "150,000–450,000", flag: "normal" },
    ] },
    { id: "REP-002", patient: { id: "P2", name: "Sita Thapa" }, testName: "Blood Sugar", requestedDate: "2026-08-29", completedDate: "2026-08-30", status: "Completed", results: [
      { test: "Fasting Glucose", result: "168", unit: "mg/dL", referenceRange: "70–100 mg/dL", flag: "high" },
    ] },
  ],

  followUps: [
    { id: "FU-001", patient: { id: "P1", name: "Ram Sharma" }, date: "2026-09-05", time: "10:00 AM", reason: "Routine monitoring", status: "Upcoming" },
    { id: "FU-002", patient: { id: "P2", name: "Sita Thapa" }, date: "2026-09-07", time: "11:30 AM", reason: "Review blood sugar", status: "Upcoming" },
  ],

  profile: {
    user: { name: "Dr. Sharma", email: "doctor@hilms.com", phone: "9812345678" },
    profile: { specialization: "Cardiology", licenseNumber: "NMC-12345", department: "Cardiology", workingHours: { start: "09:00", end: "17:00" } },
  },
};

export const fallbackDoctorSettings = {
  settings: {
    notifications: {
      appointmentReminders: true,
      labReportAlerts: true,
      followUpReminders: true,
      newPatientAlerts: false,
      systemMaintenance: true,
    },
    clinical: {
      consultationDuration: "30 minutes",
      followUpPeriod: "2 weeks",
      labReportPriority: "Normal",
      prescriptionTemplate: "Standard",
    },
    theme: "Light",
  },
};

export const fallbackNotifications = {
  notifications: [
    { id: "n1", type: "appointment", title: "Upcoming appointment", description: "Ram Sharma scheduled at 09:00 AM", time: new Date().toISOString(), read: false },
    { id: "n2", type: "lab", title: "Lab report pending", description: "CBC for Sita Thapa (Urgent)", time: new Date().toISOString(), read: false },
    { id: "n3", type: "followup", title: "Follow-up scheduled", description: "Maya Rai — Review blood sugar", time: new Date().toISOString(), read: false },
  ],
  unreadCount: 3,
};

export const fallbackConsultationDetail = {
  consultation: {
    id: "CON-ACTIVE",
    patient: { id: "P1", name: "Ram Sharma", age: 45, gender: "Male" },
    chiefComplaint: "",
    clinicalNotes: "",
    diagnosis: "",
    treatmentPlan: "",
    additionalNotes: "",
    vitalSigns: { bloodPressure: "120/80", heartRate: 72, temperature: 36.8, respiratoryRate: 16, oxygenSaturation: 98, weight: 74, height: 172 },
    status: "Draft",
  },
  patient: { id: "P1", patientId: "PAT-1001", name: "Ram Sharma", age: 45, gender: "Male", bloodGroup: "B+", phone: "9800000001", allergies: ["Penicillin"], conditions: ["Hypertension"] },
  medicalHistory: [
    { id: "CON-001", patient: { id: "P1", name: "Ram Sharma" }, diagnosis: "Hypertension", clinicalNotes: "BP elevated; advised low-salt diet.", createdAt: "2026-06-12" },
  ],
  prescriptions: [
    { id: "RX-001", diagnosis: "Hypertension", medicines: [{ name: "Amlodipine", dosage: "5 mg", frequency: "Once daily", duration: "30 days", instructions: "Take in the morning" }] },
  ],
  labReports: [
    { id: "REP-001", testName: "CBC", results: [{ test: "Hemoglobin", result: "13.0", flag: "normal" }, { test: "WBC", result: "8,200", flag: "normal" }], status: "Completed" },
  ],
  followUps: [],
};
