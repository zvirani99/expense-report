import React from 'react'
    import ReactDOM from 'react-dom/client'
    import { BrowserRouter, Routes, Route } from 'react-router-dom';
    import App from './App.tsx'
    import './index.css'
    import Register from './pages/Register.tsx';
    import SignIn from './pages/SignIn.tsx';
    import PreviousReports from './pages/PreviousReports.tsx';
    import ReportDetail from './pages/ReportDetail.tsx'; // Import the new detail page
    import { UserProvider } from './lib/UserContext.tsx';
    import PrivateRoute from './components/PrivateRoute.tsx';

    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <UserProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/register" element={<Register />} />
              <Route path="/signin" element={<SignIn />} />
              <Route 
                path="/" 
                element={
                  <PrivateRoute>
                    <App />
                  </PrivateRoute>
                } 
              />
              <Route 
                path="/reports" // Route for the list of reports
                element={
                  <PrivateRoute>
                    <PreviousReports />
                  </PrivateRoute>
                } 
              />
              <Route 
                path="/reports/:reportId" // Add dynamic route for report details
                element={
                  <PrivateRoute>
                    <ReportDetail />
                  </PrivateRoute>
                } 
              />
            </Routes>
          </BrowserRouter>
        </UserProvider>
      </React.StrictMode>,
    )
