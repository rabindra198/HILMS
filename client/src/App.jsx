import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { PublicOnlyRoute, ChangePasswordRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/Features/login/login";
import ChangePasswordPage from "@/Features/change-password/ChangePassword";
import ForgotPasswordPage from "@/Features/forgot-password/forgotPassword";
import ResetPasswordPage from "@/Features/forgot-password/resetPassword";
import UnauthorizedPage from "@/Features/unauthorized/unauthorized";
import PaymentResult from "@/Features/payment/PaymentResult";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AccessRequests from "@/pages/admin/AccessRequests";
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
import DoctorConsultations from "@/pages/doctor/Consultations";
import DoctorPrescriptions from "@/pages/doctor/Prescriptions";
import DoctorLabReports from "@/pages/doctor/LaboratoryReports";
import DoctorFollowUps from "@/pages/doctor/FollowUps";
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
import LabTests from "@/pages/lab/Tests";
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
import { LegalPage } from "@/Features/legal/LegalPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ---- Public auth routes -----------------------------------------
            There is deliberately NO public /signup or /register page. The
            "Request Access" dialog lives on the login screen: a Patient gets
            an active account immediately, while a Doctor / Laboratory submits
            a request that an Admin must approve. */}
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
        {/* Any legacy /request-access bookmark opens the same dialog. */}
        <Route path="/request-access" element={<Navigate to="/login?requestAccess=1" replace />} />
        {/* Forced first-login password change for approved Doctor / Laboratory
            accounts that still hold an emailed temporary password. */}
        <Route
          path="/change-password"
          element={
            <ChangePasswordRoute>
              <ChangePasswordPage />
            </ChangePasswordRoute>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PublicOnlyRoute>
              <ForgotPasswordPage />
            </PublicOnlyRoute>
          }
        />
        <Route
          path="/reset-password"
          element={
            <PublicOnlyRoute>
              <ResetPasswordPage />
            </PublicOnlyRoute>
          }
        />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* eSewa returns the customer here after the backend has settled the
            transaction. It is a top-level path because the gateway redirect comes
            from eSewa, not from inside the patient layout. */}
        <Route path="/payments/result" element={<PaymentResult />} />

        <Route path="/admin" element={<AdminDashboardPage />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="access-requests" element={<AccessRequests />} />
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
          <Route path="consultations" element={<DoctorConsultations />} />
          <Route path="prescriptions" element={<DoctorPrescriptions />} />
          <Route path="laboratory-reports" element={<DoctorLabReports />} />
          <Route path="follow-ups" element={<DoctorFollowUps />} />
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
          <Route path="tests" element={<LabTests />} />
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

        {/* ---- Public legal / system documents --------------------------
            Linked from the GlobalFooter. These render the shared reusable
            `LegalPage`, which shows an explicit placeholder notice until a
            project owner supplies reviewed wording - no legal text is invented
            here. `/third-party-notices` is factual: it lists the dependencies
            declared in the project's own package.json manifests. */}
        <Route path="/privacy-policy" element={<LegalPage document="privacy-policy" />} />
        <Route path="/terms-of-service" element={<LegalPage document="terms-of-service" />} />
        <Route path="/third-party-notices" element={<LegalPage document="third-party-notices" />} />

        <Route path="/" element={<LandingPage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
