import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignupPage from "@/Features/signup/signup";
import LoginPage from "@/Features/login/login";
import UnauthorizedPage from "@/Features/unauthorized/unauthorized";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import Patients from "@/pages/admin/Patients";
import Doctors from "@/pages/admin/Doctors";
import Appointments from "@/pages/admin/Appointments";
import Laboratory from "@/pages/admin/Laboratory";
import Billing from "@/pages/admin/Billing";
import Reports from "@/pages/admin/Reports";
import AdminProfile from "@/pages/admin/Profile";
import AdminNotifications from "@/pages/admin/Notifications";
import AdminSettings from "@/pages/admin/Settings";
import DoctorDashboardPage from "@/pages/doctor/DoctorDashboardPage";
import DoctorDashboard from "@/pages/doctor/DoctorDashboard";
import DoctorAppointments from "@/pages/doctor/Appointments";
import DoctorPatients from "@/pages/doctor/Patients";
import DoctorConsultation from "@/pages/doctor/DoctorConsultation";
import DoctorPrescriptions from "@/pages/doctor/Prescriptions";
import DoctorLaboratory from "@/pages/doctor/Laboratory";
import DoctorFollowUps from "@/pages/doctor/FollowUps";
import DoctorConsultationHistory from "@/pages/doctor/ConsultationHistory";
import DoctorSchedule from "@/pages/doctor/Schedule";
import DoctorWorkingHours from "@/pages/doctor/WorkingHours";
import DoctorProfile from "@/pages/doctor/Profile";
import DoctorNotifications from "@/pages/doctor/Notifications";
import DoctorSettings from "@/pages/doctor/Settings";
import LabDashboardPage from "@/pages/lab/LabDashboardPage";
import LabDashboardContent from "@/pages/lab/LabDashboardContent";
import LabRequests from "@/pages/lab/Requests";
import LabSamples from "@/pages/lab/Samples";
import LabProcessing from "@/pages/lab/Processing";
import LabReports from "@/pages/lab/Reports";
import LabProfile from "@/pages/lab/Profile";
import LabNotifications from "@/pages/lab/Notifications";
import LabSettings from "@/pages/lab/Settings";
import PatientDashboardPage from "@/pages/patient/PatientDashboardPage";
import PatientDashboardContent from "@/pages/patient/PatientDashboardContent";
import PatientAppointments from "@/pages/patient/Appointments";
import PatientMedicalHistory from "@/pages/patient/MedicalHistory";
import PatientPrescriptions from "@/pages/patient/Prescriptions";
import PatientLabReports from "@/pages/patient/LaboratoryReports";
import PatientPayments from "@/pages/patient/Payments";
import PatientProfile from "@/pages/patient/Profile";
import PatientNotifications from "@/pages/patient/Notifications";
import PatientSettings from "@/pages/patient/Settings";
import { Toaster } from "sonner";
import LandingPage from "@/Features/Landing/LandingPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        <Route path="/admin" element={<AdminDashboardPage />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="doctors" element={<Doctors />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="laboratory" element={<Laboratory />} />
          <Route path="billing" element={<Billing />} />
          <Route path="reports" element={<Reports />} />
          <Route path="profile" element={<AdminProfile />} />
          <Route path="notifications" element={<AdminNotifications />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        <Route path="/doctor" element={<DoctorDashboardPage />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DoctorDashboard />} />
          <Route path="appointments" element={<DoctorAppointments />} />
          <Route path="patients" element={<DoctorPatients />} />
          <Route path="consultation/:appointmentId" element={<DoctorConsultation />} />
          <Route path="prescriptions" element={<DoctorPrescriptions />} />
          <Route path="laboratory" element={<DoctorLaboratory />} />
          <Route path="laboratory-reports" element={<Navigate to="laboratory" replace />} />
          <Route path="follow-ups" element={<DoctorFollowUps />} />
          <Route path="consultation-history" element={<DoctorConsultationHistory />} />
          <Route path="consultations" element={<Navigate to="consultation-history" replace />} />
          <Route path="schedule" element={<DoctorSchedule />} />
          <Route path="working-hours" element={<DoctorWorkingHours />} />
          <Route path="profile" element={<DoctorProfile />} />
          <Route path="notifications" element={<DoctorNotifications />} />
          <Route path="settings" element={<DoctorSettings />} />
        </Route>

        <Route path="/lab" element={<LabDashboardPage />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<LabDashboardContent />} />
          <Route path="requests" element={<LabRequests />} />
          <Route path="samples" element={<LabSamples />} />
          <Route path="processing" element={<LabProcessing />} />
          <Route path="reports" element={<LabReports />} />
          <Route path="profile" element={<LabProfile />} />
          <Route path="notifications" element={<LabNotifications />} />
          <Route path="settings" element={<LabSettings />} />
        </Route>

        <Route path="/patient" element={<PatientDashboardPage />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<PatientDashboardContent />} />
          <Route path="appointments" element={<PatientAppointments />} />
          <Route path="medical-history" element={<PatientMedicalHistory />} />
          <Route path="prescriptions" element={<PatientPrescriptions />} />
          <Route path="laboratory-reports" element={<PatientLabReports />} />
          <Route path="payments" element={<PatientPayments />} />
          <Route path="profile" element={<PatientProfile />} />
          <Route path="notifications" element={<PatientNotifications />} />
          <Route path="settings" element={<PatientSettings />} />
        </Route>

        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
