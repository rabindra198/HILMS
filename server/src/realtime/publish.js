const { emitToRole, emitToRoles, emitToUser } = require("./socketServer");
const EVENTS = require("./events");

const idOf = (value) => String(value?._id || value || "");

const publishAppointment = (appointment, event, changes = {}) => {
  const appointmentId = idOf(appointment._id);
  const patientId = idOf(appointment.patient);
  const doctorId = idOf(appointment.doctor);
  const payload = {
    appointmentId,
    patientId,
    doctorId,
    status: appointment.status,
    changedAt: new Date().toISOString(),
    ...changes,
  };

  emitToRole("admin", event, payload);
  if (doctorId) emitToUser(doctorId, event, payload);
  if (patientId) emitToUser(patientId, event, payload);
};

const publishPatientRegistered = () => {
  emitToRoles(["admin", "doctor"], EVENTS.PATIENT_REGISTERED, {
    registeredAt: new Date().toISOString(),
  });
};

module.exports = { EVENTS, publishAppointment, publishPatientRegistered };
