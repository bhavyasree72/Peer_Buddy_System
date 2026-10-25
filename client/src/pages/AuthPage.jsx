import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { CheckCircle2, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export default function AuthPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [master, setMaster] = useState({ schools: [], programs: [], mentors: [] });

  // Login form state - ISOLATED per role (Student, Faculty, Mentor)
  const [loginRole, setLoginRole] = useState('student');
  const [loginForms, setLoginForms] = useState({
    student: { email: '', password: '' },
    faculty: { email: '', password: '' },
    mentor: { email: '', password: '' }
  });

  const currentLoginEmail = loginForms[loginRole]?.email || '';
  const currentLoginPassword = loginForms[loginRole]?.password || '';

  const updateLoginForm = (field, value) => {
    setMessage('');
    setError('');
    setLoginForms(prev => ({
      ...prev,
      [loginRole]: {
        ...prev[loginRole],
        [field]: value
      }
    }));
  };

  // Register form state - isolated state per role (Issue 7)
  const [selectedRole, setSelectedRole] = useState('student');
  const [step, setStep] = useState(1);

  const initialStudentData = {
    fullName: '',
    sapId: '',
    email: '',
    password: '',
    confirmPassword: '',
    schoolId: '',
    programId: '',
    year: '',
    semester: '',
    mentorId: ''
  };

  const initialStaffData = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    designation: ''
  };

  const [studentForm, setStudentForm] = useState(initialStudentData);
  const [facultyForm, setFacultyForm] = useState(initialStaffData);
  const [mentorForm, setMentorForm] = useState(initialStaffData);

  // Active form pointer helper
  const currentForm = selectedRole === 'student' ? studentForm : selectedRole === 'faculty' ? facultyForm : mentorForm;

  useEffect(() => {
    api.getMasterData().then(data => {
      if (data) {
        setMaster(data);
      }
    }).catch(err => console.error(err));
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Reset password state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    // Check if URL has reset-password in search or hash
    const searchParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash || '';
    let token = searchParams.get('token');
    if (!token && hash.includes('token=')) {
      const hashQuery = hash.includes('?') ? hash.split('?')[1] : hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashQuery);
      token = hashParams.get('token');
    }
    if (token) {
      setResetToken(token);
      setResetMode(true);
    }
  }, []);

  // Strong password checker helper (Issue 6)
  function evaluatePassword(pwd) {
    const hasMinLen = (pwd || '').length >= 8;
    const hasUpper = /[A-Z]/.test(pwd || '');
    const hasLower = /[a-z]/.test(pwd || '');
    const hasDigit = /[0-9]/.test(pwd || '');
    const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pwd || '');
    const isValid = hasMinLen && hasUpper && hasLower && hasDigit && hasSpecial;
    return { hasMinLen, hasUpper, hasLower, hasDigit, hasSpecial, isValid };
  }

  const regPwdStatus = evaluatePassword(currentForm.password);
  const resetPwdStatus = evaluatePassword(newPassword);

  // Login Email Placeholder
  const getLoginPlaceholder = () => {
    return 'Enter your Gmail address (example@gmail.com)';
  };

  // Role switch handler that isolates state and resets errors (Issue 7)
  function handleRoleSwitch(newRole) {
    setSelectedRole(newRole);
    setError('');
    setMessage('');
    setStep(1);
  }

  function updateActiveForm(field, value) {
    setMessage('');
    setError('');
    if (selectedRole === 'student') {
      setStudentForm(prev => ({ ...prev, [field]: value }));
    } else if (selectedRole === 'faculty') {
      setFacultyForm(prev => ({ ...prev, [field]: value }));
    } else {
      setMentorForm(prev => ({ ...prev, [field]: value }));
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await api.login({ email: currentLoginEmail, password: currentLoginPassword });
      localStorage.setItem('token', res.accessToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    // Step 1 validation
    if (step === 1) {
      if (!currentForm.fullName || !currentForm.email || !currentForm.password) {
        setError('Please fill in all required fields.');
        return;
      }

      // Name validation: letters and spaces only, min 2 chars (Issue 6)
      const trimmedName = currentForm.fullName.trim();
      if (trimmedName.length < 2 || !/^[a-zA-Z\s]+$/.test(trimmedName)) {
        setError('Full Name must contain letters and spaces only (minimum 2 characters).');
        return;
      }

      // Email validation: Strictly @gmail.com for Student, Faculty, and Mentor
      const trimmedEmail = currentForm.email.trim().toLowerCase();
      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
      if (!gmailRegex.test(trimmedEmail)) {
        setError('Please enter a valid Gmail address ending with @gmail.com.');
        return;
      }

      // SAP ID validation for students: 11 digits starting with 7 (Issue 4)
      if (selectedRole === 'student') {
        if (!currentForm.sapId) {
          setError('SAP ID is required for student registration.');
          return;
        }
        if (!/^7\d{10}$/.test(currentForm.sapId.trim())) {
          setError('SAP ID must be exactly 11 digits, numeric only, and start with 7 (e.g. 70572400072).');
          return;
        }
      }

      // Password rules: min 8, 1 uppercase, 1 lowercase, 1 digit, 1 special char (Issue 6)
      if (!regPwdStatus.isValid) {
        setError('Password does not meet the security criteria. Please follow the checklist below.');
        return;
      }

      if (currentForm.password !== currentForm.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      setStep(2);
      return;
    }

    // Step 2 validation (Issues 2 & 8: Dropdowns must not be empty/placeholder)
    if (selectedRole === 'student') {
      if (!currentForm.schoolId) {
        setError('Please select a school.');
        return;
      }
      if (!currentForm.programId) {
        setError('Please select a program/branch.');
        return;
      }
      if (!currentForm.year) {
        setError('Please select an academic year.');
        return;
      }
      if (!currentForm.semester) {
        setError('Please select a semester.');
        return;
      }
      if (!currentForm.mentorId) {
        setError('Please select a mentor to connect with.');
        return;
      }
    } else {
      if (!currentForm.department || !currentForm.department.trim()) {
        setError('Please enter your department.');
        return;
      }
      if (!currentForm.designation || !currentForm.designation.trim()) {
        setError('Please enter your designation.');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        role: selectedRole,
        fullName: currentForm.fullName.trim(),
        email: currentForm.email.trim().toLowerCase(),
        password: currentForm.password,
        ...(selectedRole === 'student' ? {
          sapId: currentForm.sapId.trim(),
          schoolId: currentForm.schoolId,
          programId: currentForm.programId,
          year: parseInt(currentForm.year, 10),
          semester: parseInt(currentForm.semester, 10),
          mentorId: currentForm.mentorId
        } : {
          department: currentForm.department.trim(),
          designation: currentForm.designation.trim()
        })
      };

      const res = await api.register(payload);
      const successMsg = res.emailSent
        ? 'Account created successfully! You can sign in now.'
        : 'Account created. You can sign in now. The confirmation email could not be sent.';
      setMessage(successMsg);
      setIsRegister(false);
      setStep(1);
      setStudentForm(initialStudentData);
      setFacultyForm(initialStaffData);
      setMentorForm(initialStaffData);
      // Pre-fill registered email in the corresponding role's login box
      setLoginRole(selectedRole);
      setLoginForms(prev => ({
        ...prev,
        [selectedRole]: { email: payload.email, password: '' }
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError('');

    if (!newPassword || !confirmNewPassword) {
      setError('Please provide and confirm your new password.');
      return;
    }
    if (!resetPwdStatus.isValid) {
      setError('New password does not satisfy strong security requirements.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword({ token: resetToken, newPassword });
      setMessage(res.message);
      setResetMode(false);
      window.location.hash = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    if (!forgotEmail) {
      setError('Please provide your registered Gmail address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.forgotPassword(forgotEmail);
      setMessage(res.message);
      setForgotMode(false);
      setForgotEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      backgroundColor: 'var(--bg-subtle)'
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        maxWidth: '960px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        overflow: 'hidden',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}>
        {/* Left half: Welcome brand intro */}
        <div style={{
          padding: '48px 40px',
          borderRight: '1px solid var(--border)',
          backgroundColor: '#FAFAFA',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--accent-tint)',
            color: 'var(--accent)',
            padding: '6px 14px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: '600',
            width: 'fit-content',
            marginBottom: '20px'
          }}>
            <ShieldCheck size={16} /> NMIMS Verified Academic Portal
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px', lineHeight: '1.25' }}>
            Find your study partner at NMIMS
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '28px', lineHeight: '1.5' }}>
            Connect with peers, collaborate on coursework, schedule revision sessions, and build projects within your college community.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Multi-Buddy Collaborative Network</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Connect with multiple buddies across batches, courses, and programs.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Dual-Verified Study Sessions</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Real attendance confirmed by both participants for faculty oversight.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Role-Secured NMIMS Authentication</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Exclusive intra-college access for students, mentors, and faculty.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right half: Auth cards */}
        <div style={{ padding: '44px 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              backgroundColor: 'var(--accent-tint)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--accent)',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {message && !isRegister && !forgotMode && !resetMode && (
            <div style={{
              padding: '12px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #DCFCE7',
              borderRadius: 'var(--radius-sm)',
              color: '#166534',
              fontSize: '13px',
              marginBottom: '20px'
            }}>
              {message}
            </div>
          )}

          {/* MODE 1: Reset Password Page */}
          {resetMode ? (
            <form onSubmit={handleResetPassword} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Create New Password</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Please set a secure password meeting NMIMS security requirements.
              </p>
              
              <div style={{ marginBottom: '14px' }}>
                <label>New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset_new_password"
                  name="reset_new_password"
                  placeholder="Enter strong password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                
                {/* Password strength breakdown */}
                <div style={{ marginTop: '8px', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                  <span style={{ color: resetPwdStatus.hasMinLen ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasMinLen ? '✓' : '○'} Min 8 chars
                  </span>
                  <span style={{ color: resetPwdStatus.hasUpper ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasUpper ? '✓' : '○'} 1 Uppercase
                  </span>
                  <span style={{ color: resetPwdStatus.hasLower ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasLower ? '✓' : '○'} 1 Lowercase
                  </span>
                  <span style={{ color: resetPwdStatus.hasDigit ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasDigit ? '✓' : '○'} 1 Number
                  </span>
                  <span style={{ color: resetPwdStatus.hasSpecial ? '#166534' : 'var(--text-muted)' }}>
                    {resetPwdStatus.hasSpecial ? '✓' : '○'} 1 Special char
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label>Confirm New Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="reset_confirm_password"
                  name="reset_confirm_password"
                  placeholder="Repeat new password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  id="toggle_show_pwd_reset"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="toggle_show_pwd_reset" style={{ cursor: 'pointer', margin: 0 }}>Show password</label>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => { setResetMode(false); window.location.hash = ''; }}>
                Back to login
              </button>
            </form>
          ) : forgotMode ? (
            /* MODE 2: Forgot Password Form */
            <form onSubmit={handleForgotPassword} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Reset Your Password</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your registered NMIMS email address. A password reset link valid for 30 minutes will be sent to your inbox.
              </p>
              
              <div style={{ marginBottom: '16px' }}>
                <label>Registered Gmail Address</label>
                <input
                  type="email"
                  id="forgot_email"
                  name="forgot_email"
                  placeholder="Enter your registered Gmail address"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Sending link...' : 'Send reset link'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => { setForgotMode(false); setError(''); }}>
                Back to login
              </button>
            </form>
          ) : !isRegister ? (
            /* MODE 3: Login Form with Role-Aware Email Placeholder (Issue 10) */
            <form onSubmit={handleLogin} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '6px' }}>Sign in to your account</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Select your role to adapt login parameters.
              </p>

              {/* Role Toggle for Login Placeholder Awareness */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '18px' }}>
                {[
                  { id: 'student', label: 'Student' },
                  { id: 'faculty', label: 'Faculty' },
                  { id: 'mentor', label: 'Mentor' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setLoginRole(r.id);
                      setMessage('');
                      setError('');
                    }}
                    style={{
                      padding: '7px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${loginRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                      backgroundColor: loginRole === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                      color: loginRole === r.id ? 'var(--accent)' : 'var(--text-main)',
                      fontWeight: loginRole === r.id ? '600' : '500',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label>{loginRole.charAt(0).toUpperCase() + loginRole.slice(1)} Gmail Address</label>
                <input
                  type="email"
                  id={`login_email_${loginRole}`}
                  name={`login_email_${loginRole}`}
                  autoComplete="off"
                  placeholder={getLoginPlaceholder()}
                  value={currentLoginEmail}
                  onChange={(e) => updateLoginForm('email', e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>{loginRole.charAt(0).toUpperCase() + loginRole.slice(1)} Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  id={`login_password_${loginRole}`}
                  name={`login_password_${loginRole}`}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={currentLoginPassword}
                  onChange={(e) => updateLoginForm('password', e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    id="login_show_pwd"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Show password
                </label>
                <a
                  href="#forgot"
                  onClick={(e) => { e.preventDefault(); setForgotMode(true); setMessage(''); setError(''); }}
                  style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Forgot password?
                </a>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '20px' }} disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                New to Peer Buddy?{' '}
                <a
                  href="#register"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(true);
                    setStep(1);
                    setError('');
                    setMessage('');
                  }}
                  style={{ fontWeight: '600', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Create an account
                </a>
              </div>
            </form>
          ) : (
            /* MODE 4: Registration Form (Isolated States per Role & Placeholders) */
            <form onSubmit={handleRegister} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
                Register as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Step {step} of 2: {step === 1 ? 'Personal & login details' : selectedRole === 'student' ? 'Academic details & mentor' : 'Department & designation'}
              </p>

              {/* Role Selection Tabs with Form State Isolation (Issue 7) */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ marginBottom: '6px', display: 'block', fontSize: '13px' }}>I am registering as</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { id: 'student', label: 'Student' },
                    { id: 'faculty', label: 'Faculty' },
                    { id: 'mentor', label: 'Mentor' }
                  ].map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleRoleSwitch(r.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${selectedRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                        backgroundColor: selectedRole === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                        color: selectedRole === r.id ? 'var(--accent)' : 'var(--text-main)',
                        fontWeight: selectedRole === r.id ? '600' : '500',
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              {step === 1 ? (
                <>
                  {/* Name: letters and spaces only, min 2 chars (Issue 6) */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Full Name *</label>
                    <input
                      type="text"
                      id={`${selectedRole}_fullname`}
                      name={`${selectedRole}_fullname`}
                      autoComplete="off"
                      placeholder="e.g. Bhavya Sree"
                      value={currentForm.fullName}
                      onChange={(e) => updateActiveForm('fullName', e.target.value)}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Letters and spaces only (min 2 characters)
                    </div>
                  </div>

                  {/* SAP ID: Student only, 11 digits starting with 7 (Issue 4 & 7) */}
                  {selectedRole === 'student' && (
                    <div style={{ marginBottom: '12px' }}>
                      <label>SAP ID (11 digits, starts with 7) *</label>
                      <input
                        type="text"
                        id="student_sap_id"
                        name="student_sap_id"
                        autoComplete="off"
                        maxLength={11}
                        placeholder="70572400072"
                        value={studentForm.sapId}
                        onChange={(e) => updateActiveForm('sapId', e.target.value.replace(/\D/g, ''))}
                        required
                      />
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Must be exactly 11 numeric digits starting with 7
                      </div>
                    </div>
                  )}

                  {/* Email: Strictly Gmail address for Student, Faculty, and Mentor */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Gmail Address *</label>
                    <input
                      type="email"
                      id={`${selectedRole}_email`}
                      name={`${selectedRole}_email`}
                      autoComplete="off"
                      placeholder="Enter your Gmail address (example@gmail.com)"
                      value={currentForm.email}
                      onChange={(e) => updateActiveForm('email', e.target.value)}
                      required
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Must be a valid Gmail address ending with @gmail.com
                    </div>
                  </div>

                  {/* Password with live strength indicator (Issue 6) */}
                  <div style={{ marginBottom: '12px' }}>
                    <label>Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id={`${selectedRole}_password`}
                      name={`${selectedRole}_password`}
                      autoComplete="new-password"
                      placeholder="Create a strong password"
                      value={currentForm.password}
                      onChange={(e) => updateActiveForm('password', e.target.value)}
                      required
                    />
                    
                    {/* Live Criteria Breakdown */}
                    <div style={{ marginTop: '6px', fontSize: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px' }}>
                      <span style={{ color: regPwdStatus.hasMinLen ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasMinLen ? '✓' : '○'} Min 8 chars
                      </span>
                      <span style={{ color: regPwdStatus.hasUpper ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasUpper ? '✓' : '○'} 1 Uppercase
                      </span>
                      <span style={{ color: regPwdStatus.hasLower ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasLower ? '✓' : '○'} 1 Lowercase
                      </span>
                      <span style={{ color: regPwdStatus.hasDigit ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasDigit ? '✓' : '○'} 1 Number
                      </span>
                      <span style={{ color: regPwdStatus.hasSpecial ? '#166534' : 'var(--text-muted)' }}>
                        {regPwdStatus.hasSpecial ? '✓' : '○'} 1 Special char
                      </span>
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label>Confirm Password *</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      id={`${selectedRole}_confirm_password`}
                      name={`${selectedRole}_confirm_password`}
                      autoComplete="new-password"
                      placeholder="Repeat your password"
                      value={currentForm.confirmPassword}
                      onChange={(e) => updateActiveForm('confirmPassword', e.target.value)}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }}>
                    Continue to step 2
                  </button>
                </>
              ) : (
                /* Step 2: Academic or Department details with disabled, selected placeholders (Issues 2 & 8) */
                <>
                  {selectedRole === 'student' ? (
                    <>
                      {/* School Dropdown with Disabled Placeholder */}
                      <div style={{ marginBottom: '12px' }}>
                        <label>School *</label>
                        <select
                          id="student_school"
                          value={studentForm.schoolId}
                          onChange={(e) => updateActiveForm('schoolId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select school…</option>
                          {master.schools && master.schools.length > 0 ? (
                            master.schools
                              .filter(s => ['STME', 'SOL', 'SPTM', 'SBM', 'SOC'].includes((s.code || '').toUpperCase()))
                              .map(s => (
                                <option key={s.id} value={s.id}>{s.code} – {s.name.replace(/\s*\([^)]*\)$/, '')}</option>
                              ))
                          ) : (
                            <>
                              <option value="sch-stme">STME – School of Technology Management and Engineering</option>
                              <option value="sch-sol">SOL – School of Law</option>
                              <option value="sch-sptm">SPTM – School of Pharmacy & Technology Management</option>
                              <option value="sch-sbm">SBM – School of Business Management</option>
                              <option value="sch-soc">SOC – School of Commerce</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Program Dropdown with Disabled Placeholder */}
                      <div style={{ marginBottom: '12px' }}>
                        <label>Program / Branch *</label>
                        <select
                          id="student_program"
                          value={studentForm.programId}
                          onChange={(e) => updateActiveForm('programId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select program / branch…</option>
                          {master.programs && master.programs.length > 0 ? (
                            master.programs
                              .filter(p => !studentForm.schoolId || p.school_id === studentForm.schoolId)
                              .map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                              ))
                          ) : (
                            <>
                              <option value="prog-csds">B.Tech Computer Science & Data Science (CSDS)</option>
                              <option value="prog-aiml">B.Tech Artificial Intelligence & Machine Learning</option>
                              <option value="prog-cse">B.Tech Computer Engineering</option>
                              <option value="prog-it">B.Tech Information Technology</option>
                              <option value="prog-mba-tech">MBA Tech Computer Science</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Year & Semester with Disabled Placeholders */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <label>Academic Year *</label>
                          <select
                            id="student_year"
                            value={studentForm.year}
                            onChange={(e) => updateActiveForm('year', e.target.value)}
                            required
                          >
                            <option value="" disabled>Select year…</option>
                            <option value={1}>1st Year</option>
                            <option value={2}>2nd Year</option>
                            <option value={3}>3rd Year</option>
                            <option value={4}>4th Year</option>
                          </select>
                        </div>
                        <div>
                          <label>Semester *</label>
                          <select
                            id="student_semester"
                            value={studentForm.semester}
                            onChange={(e) => updateActiveForm('semester', e.target.value)}
                            required
                          >
                            <option value="" disabled>Select semester…</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                              <option key={s} value={s}>Semester {s}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Mentor Selection with Disabled Placeholder */}
                      <div style={{ marginBottom: '20px' }}>
                        <label>Select Mentor to Connect With *</label>
                        <select
                          id="student_mentor"
                          value={studentForm.mentorId}
                          onChange={(e) => updateActiveForm('mentorId', e.target.value)}
                          required
                        >
                          <option value="" disabled>Select mentor…</option>
                          {master.mentors && master.mentors.length > 0 ? (
                            master.mentors.map(m => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.full_name} {m.department ? `(${m.department})` : ''}
                              </option>
                            ))
                          ) : (
                            <option value="usr-mentor-1">Dr. Rajesh Deshmukh (Computer Engineering & Data Science)</option>
                          )}
                        </select>
                      </div>
                    </>
                  ) : (
                    /* Faculty / Mentor Department & Designation */
                    <>
                      <div style={{ marginBottom: '14px' }}>
                        <label>Department *</label>
                        <input
                          type="text"
                          id={`${selectedRole}_department`}
                          name={`${selectedRole}_department`}
                          autoComplete="off"
                          placeholder="e.g. Computer Science & Engineering"
                          value={currentForm.department}
                          onChange={(e) => updateActiveForm('department', e.target.value)}
                          required
                        />
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <label>Designation *</label>
                        <input
                          type="text"
                          id={`${selectedRole}_designation`}
                          name={`${selectedRole}_designation`}
                          autoComplete="off"
                          placeholder={selectedRole === 'mentor' ? 'e.g. Senior Technical Mentor / Guide' : 'e.g. Assistant Professor'}
                          value={currentForm.designation}
                          onChange={(e) => updateActiveForm('designation', e.target.value)}
                          required
                        />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ flex: 1 }}>
                      Back
                    </button>
                    <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={loading}>
                      {loading ? 'Submitting...' : 'Complete registration'}
                    </button>
                  </div>
                </>
              )}

              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
                Already registered?{' '}
                <a
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(false);
                    setStep(1);
                    setError('');
                  }}
                  style={{ fontWeight: '600', color: 'var(--accent)', textDecoration: 'none' }}
                >
                  Sign in
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
