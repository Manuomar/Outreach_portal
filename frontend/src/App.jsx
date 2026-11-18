import { Navigate, Route, Routes } from 'react-router-dom'
import { auth } from './api'
import Layout from './components/Layout.jsx'
import {
  Login,
  Dashboard,
  Numbers,
  AddNumbers,
  LiveCall,
  CallDetail,
  CallHistory,
  Meetings,
  Users,
  Agents,
  CreateAgent,
  EditAgent,
  ViewAgent,
  ManageKeys,
} from './pages'

function Protected({ children }) {
  return auth.token ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/numbers" element={<Numbers />} />
        <Route path="/numbers/add" element={<AddNumbers />} />
        <Route path="/live-call" element={<LiveCall />} />
        <Route path="/agents" element={<Agents />} />
        <Route path="/agents/create" element={<CreateAgent />} />
        <Route path="/agents/:id" element={<ViewAgent />} />
        <Route path="/agents/:id/edit" element={<EditAgent />} />
        <Route path="/calls/:id" element={<CallDetail />} />
        <Route path="/call-history" element={<CallHistory />} />
        <Route path="/meetings" element={<Meetings />} />
        <Route path="/keys" element={<ManageKeys />} />
        <Route path="/users" element={<Users />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
