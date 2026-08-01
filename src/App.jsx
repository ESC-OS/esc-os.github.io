import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './shared/ProtectedRoute';
import Layout from './shared/Layout';

import LoginPage from './features/auth/LoginPage';
import AuthCallbackPage from './features/auth/AuthCallbackPage';
import DashboardPage from './features/dashboard/DashboardPage';
import ProfilePage from './features/profile/ProfilePage';
import ProjectsPage from './features/projects/ProjectsPage';
import ProjectDetailPage from './features/projects/ProjectDetailPage';
import RequestsPage from './features/requests/RequestsPage';
import NewRequestPage from './features/requests/NewRequestPage';
import RequestDetailPage from './features/requests/RequestDetailPage';
import VisitsPage from './features/visits/VisitsPage';
import VisitDetailPage from './features/visits/VisitDetailPage';
import DepositsPage from './features/deposits/DepositsPage';
import DepositDetailPage from './features/deposits/DepositDetailPage';
import StorageAreasPage from './features/storage-areas/StorageAreasPage';
import StorageAreaDetailPage from './features/storage-areas/StorageAreaDetailPage';
import DonationsPage from './features/donations/DonationsPage';
import DonationDetailPage from './features/donations/DonationDetailPage';
import ItemsPage from './features/items/ItemsPage';
import ItemBrowsePage from './features/items/ItemBrowsePage';
import ItemDetailPage from './features/items/ItemDetailPage';
import NotificationsPage from './features/notifications/NotificationsPage';
import AdminItemsPage from './features/admin/items/AdminItemsPage';
import AdminStockPage from './features/admin/items/AdminStockPage';
import AdminQueuePage from './features/admin/requests/AdminQueuePage';
import AdminReturnsPage from './features/admin/requests/AdminReturnsPage';
import AdminVisitsPage from './features/admin/visits/AdminVisitsPage';
import AdminCalendarPage from './features/admin/calendar/AdminCalendarPage';
import AdminSlotsPage from './features/admin/config/AdminSlotsPage';
import AdminHolidaysPage from './features/admin/config/AdminHolidaysPage';
import AdminUsersPage from './features/admin/users/AdminUsersPage';
import AdminBroadcastPage from './features/admin/broadcast/AdminBroadcastPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/requests" element={<RequestsPage />} />
            <Route path="/requests/new" element={<NewRequestPage />} />
            <Route path="/requests/:id" element={<RequestDetailPage />} />
            <Route path="/visits" element={<VisitsPage />} />
            <Route path="/visits/:id" element={<VisitDetailPage />} />
            <Route path="/deposits" element={<DepositsPage />} />
            <Route path="/deposits/:id" element={<DepositDetailPage />} />
            <Route path="/storage-areas" element={<StorageAreasPage />} />
            <Route path="/storage-areas/:id" element={<StorageAreaDetailPage />} />
            <Route path="/donations" element={<DonationsPage />} />
            <Route path="/donations/:id" element={<DonationDetailPage />} />
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/items/browse" element={<ItemBrowsePage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>

          <Route element={<ProtectedRoute roles={['admin']}><Layout /></ProtectedRoute>}>
            <Route path="/admin/items" element={<AdminItemsPage />} />
            <Route path="/admin/stock" element={<AdminStockPage />} />
            <Route path="/admin/queue" element={<AdminQueuePage />} />
            <Route path="/admin/returns" element={<AdminReturnsPage />} />
            <Route path="/admin/visits" element={<AdminVisitsPage />} />
            <Route path="/admin/calendar" element={<AdminCalendarPage />} />
            <Route path="/admin/slots" element={<AdminSlotsPage />} />
            <Route path="/admin/holidays" element={<AdminHolidaysPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/broadcast" element={<AdminBroadcastPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
