import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function AuthPage({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [master, setMaster] = useState({ schools: [], programs: [] });

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form state (Step 1 and 2 from doc 7.3)
  const [step, setStep] = useState(1);
  const [regData, setRegData] = useState({
    role: 'student', // 'student', 'mentor', 'faculty'
    fullName: '',
    sapId: '',
    email: '',
    password: '',
    confirmPassword: '',
    schoolId: 'sch-stme',
    programId: 'prog-csds',
    semester: 1,
    year: 1,
    mentorId: '',
    department: 'Computer Science & Engineering',
    designation: 'Assistant Professor'
  });

  useEffect(() => {
    api.getMasterData().then(data => {
      if (data && data.schools) {
        setMaster(data);
        if (data.schools.length > 0 && !data.schools.some(s => s.id === regData.schoolId)) {
          setRegData(prev => ({
            ...prev,
            schoolId: data.schools[0].id,
            mentorId: (data.mentors && data.mentors.length > 0) ? data.mentors[0].user_id : ''
          }));
        } else if (data.mentors && data.mentors.length > 0) {
          setRegData(prev => ({
            ...prev,
            mentorId: prev.mentorId || data.mentors[0].user_id
          }));
        }
      }
    }).catch(err => console.error(err));
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Live password strength hint from doc 7.3: min 8 chars, 1 letter, 1 number
  const passwordHasMinLen = regData.password.length >= 8;
  const passwordHasLetter = /[a-zA-Z]/.test(regData.password);
  const passwordHasNumber = /[0-9]/.test(regData.password);
  const passwordValid = passwordHasMinLen && passwordHasLetter && passwordHasNumber;

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await api.login({ email, password });
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
    if (step === 1) {
      if (!regData.fullName || !regData.email || !regData.password) {
        setError('Please fill all required fields.');
        return;
      }
      if (regData.role === 'student' && !regData.sapId) {
        setError('SAP ID is required for student registration.');
        return;
      }
      if (!passwordValid) {
        setError('Password must be at least 8 characters long and contain at least one letter and one number.');
        return;
      }
      if (regData.password !== regData.confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setError('');
      setStep(2);
      return;
    }

    if (regData.role === 'student' && !regData.mentorId) {
      setError('Please select a mentor to connect with.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.register(regData);
      setMessage(res.message);
      setIsRegister(false);
      setStep(1);
      setRegData({
        role: 'student',
        fullName: '',
        sapId: '',
        email: '',
        password: '',
        confirmPassword: '',
        schoolId: master.schools && master.schools[0] ? master.schools[0].id : 'sch-stme',
        programId: master.programs && master.programs[0] ? master.programs[0].id : 'prog-csds',
        semester: 1,
        year: 1,
        mentorId: master.mentors && master.mentors[0] ? master.mentors[0].user_id : '',
        department: 'Computer Science & Engineering',
        designation: 'Assistant Professor'
      });
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    // Check if URL has #reset-password or token query parameter
    const hash = window.location.hash || '';
    if (hash.includes('reset-password')) {
      const urlParams = new URLSearchParams(hash.split('?')[1] || window.location.search);
      const token = urlParams.get('token');
      if (token) {
        setResetToken(token);
        setResetMode(true);
      }
    }
  }, []);

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!newPassword || !confirmNewPassword) {
      setError('Please provide and confirm your new password.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    setError('');
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
    if (!email) {
      setError('Please provide your NMIMS email address.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.forgotPassword(email);
      setMessage(res.message);
      setForgotMode(false);
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
        maxWidth: '920px',
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        overflow: 'hidden'
      }}>
        {/* Left half from doc 7.3: Short heading + 3 short lines about what platform does */}
        <div style={{
          padding: '48px 40px',
          borderRight: '1px solid var(--border)',
          backgroundColor: '#FFFFFF',
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
            padding: '6px 12px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: '600',
            width: 'fit-content',
            marginBottom: '20px'
          }}>
            NMIMS Verified Space
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '16px', lineHeight: '1.25' }}>
            Find your study partner at NMIMS
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '24px' }}>
            Connect with peers, collaborate on coursework, and build projects within your college community.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Skill & Subject Matching</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Get matched by shared courses and complementary strengths.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Study Session Scheduling</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Propose sessions, resolve calendar conflicts, and track attendance.</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <CheckCircle2 size={20} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ display: 'block', fontSize: '14px', color: 'var(--text-main)' }}>Faculty & Mentor Guidance</strong>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Safe moderation and shared academic resources with zero chat invasion.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right half from doc 7.3: Login / Registration Card */}
        <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div style={{
              padding: '12px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #DCFCE7',
              borderRadius: 'var(--radius-sm)',
              color: '#166534',
              fontSize: '14px',
              marginBottom: '20px'
            }}>
              {message}
            </div>
          )}

          {resetMode ? (
            <form onSubmit={handleResetPassword}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Create new password</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your new password below. It must be at least 8 characters and contain at least one letter and one number.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label>New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label>Confirm New Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Updating password...' : 'Update Password'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => { setResetMode(false); window.location.hash = ''; }}>
                Back to login
              </button>
            </form>
          ) : forgotMode ? (
            <form onSubmit={handleForgotPassword}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Reset your password</h2>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Enter your college email address. A password reset link valid for 30 minutes will be sent.
              </p>
              <div style={{ marginBottom: '16px' }}>
                <label>NMIMS Email</label>
                <input
                  type="email"
                  placeholder="name@nmims.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }} disabled={loading}>
                {loading ? 'Sending link...' : 'Send reset link'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => setForgotMode(false)}>
                Back to login
              </button>
            </form>
          ) : !isRegister ? (
            /* Login Form */
            <form onSubmit={handleLogin} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>Sign in to your account</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Use your official NMIMS email address.
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label>College Email</label>
                <input
                  type="email"
                  name="email"
                  autoComplete="off"
                  placeholder="student@nmims.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label>Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="new-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={(e) => setShowPassword(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  Show password
                </label>
                <a
                  href="#forgot"
                  onClick={(e) => { e.preventDefault(); setForgotMode(true); }}
                  style={{ fontSize: '13px', color: 'var(--accent)' }}
                >
                  Forgot password?
                </a>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '20px' }} disabled={loading}>
                {loading ? 'Signing in...' : 'Login'}
              </button>

              <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                New here?{' '}
                <a
                  href="#register"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(true);
                    setStep(1);
                    setError('');
                    setEmail('');
                    setPassword('');
                  }}
                  style={{ fontWeight: '600' }}
                >
                  Create account
                </a>
              </div>
            </form>
          ) : (
            /* Registration Form (Two Steps) */
            <form onSubmit={handleRegister} autoComplete="off">
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>
                Create {regData.role === 'student' ? 'Student' : regData.role === 'mentor' ? 'Mentor' : 'Faculty'} Account
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Step {step} of 2: {step === 1 ? 'Role & login details' : regData.role === 'student' ? 'Academic details & mentor' : 'Department & designation'}
              </p>

              {step === 1 ? (
                <>
                  {/* Role Selection Tabs */}
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ marginBottom: '6px', display: 'block' }}>I am registering as</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      {[
                        { id: 'student', label: 'Student' },
                        { id: 'mentor', label: 'Mentor' },
                        { id: 'faculty', label: 'Faculty' }
                      ].map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRegData({ ...regData, role: r.id })}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 'var(--radius-sm)',
                            border: `1px solid ${regData.role === r.id ? 'var(--accent)' : 'var(--border)'}`,
                            backgroundColor: regData.role === r.id ? 'var(--accent-tint)' : '#FFFFFF',
                            color: regData.role === r.id ? 'var(--accent)' : 'var(--text-main)',
                            fontWeight: regData.role === r.id ? '600' : '500',
                            fontSize: '13px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label>Full Name</label>
                    <input
                      type="text"
                      name="fullName"
                      autoComplete="off"
                      placeholder={regData.role === 'student' ? 'e.g. Bhavya G' : regData.role === 'mentor' ? 'e.g. Dr. Rajesh Deshmukh' : 'e.g. Prof. Ananya Iyer'}
                      value={regData.fullName}
                      onChange={(e) => setRegData({ ...regData, fullName: e.target.value })}
                      required
                    />
                  </div>

                  {regData.role === 'student' && (
                    <div style={{ marginBottom: '12px' }}>
                      <label>SAP ID (11 digits)</label>
                      <input
                        type="text"
                        name="sapId"
                        autoComplete="off"
                        placeholder="e.g. 70572400072"
                        value={regData.sapId}
                        onChange={(e) => setRegData({ ...regData, sapId: e.target.value })}
                        required
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label>NMIMS Email</label>
                    <input
                      type="email"
                      name="regEmail"
                      autoComplete="off"
                      placeholder="name@nmims.in"
                      value={regData.email}
                      onChange={(e) => setRegData({ ...regData, email: e.target.value })}
                      required
                    />
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label>Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="regPassword"
                      autoComplete="new-password"
                      placeholder="Min 8 chars, 1 letter, 1 number"
                      value={regData.password}
                      onChange={(e) => setRegData({ ...regData, password: e.target.value })}
                      required
                    />
                    {/* Live Strength Hint from doc 7.3 */}
                    <div style={{ fontSize: '12px', marginTop: '4px', color: passwordValid ? '#166534' : 'var(--text-muted)' }}>
                      {passwordValid ? '✓ Password criteria met' : 'Requires min 8 characters, at least 1 letter and 1 number'}
                    </div>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label>Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="regConfirmPassword"
                      autoComplete="new-password"
                      placeholder="Confirm password"
                      value={regData.confirmPassword}
                      onChange={(e) => setRegData({ ...regData, confirmPassword: e.target.value })}
                      required
                    />
                  </div>

                  <button type="submit" className="btn-primary" style={{ width: '100%', marginBottom: '12px' }}>
                    Continue to step 2
                  </button>
                </>
              ) : (
                <>
                  {regData.role === 'student' ? (
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <label>School</label>
                        <select
                          value={regData.schoolId}
                          onChange={(e) => {
                            const newSchoolId = e.target.value;
                            const schoolObj = master.schools.find(s => s.id === newSchoolId || s.code === newSchoolId);
                            const maxSem = schoolObj ? (schoolObj.semesters || 8) : 8;
                            setRegData(prev => ({
                              ...prev,
                              schoolId: newSchoolId,
                              semester: prev.semester > maxSem ? 1 : prev.semester
                            }));
                          }}
                        >
                          {master.schools && master.schools.length > 0 ? (
                            master.schools.map(s => (
                              <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                            ))
                          ) : (
                            <>
                              <option value="sch-stme">School of Technology Management and Engineering (STME)</option>
                              <option value="sch-sptm">School of Pharmacy & Technology Management (SPTM)</option>
                              <option value="sch-sol">School of Law (SOL)</option>
                              <option value="sch-sbm">School of Business Management (SBM)</option>
                              <option value="sch-soc">School of Commerce (SOC)</option>
                            </>
                          )}
                        </select>
                      </div>

                      <div style={{ marginBottom: '12px' }}>
                        <label>Program</label>
                        <select
                          value={regData.programId}
                          onChange={(e) => setRegData({ ...regData, programId: e.target.value })}
                        >
                          {master.programs && master.programs.length > 0 ? (
                            master.programs
                              .filter(p => !regData.schoolId || p.school_id === regData.schoolId)
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

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                        <div>
                          <label>Year</label>
                          <select
                            value={regData.year}
                            onChange={(e) => setRegData({ ...regData, year: parseInt(e.target.value, 10) })}
                          >
                            <option value={1}>1st Year</option>
                            <option value={2}>2nd Year</option>
                            <option value={3}>3rd Year</option>
                            <option value={4}>4th Year</option>
                          </select>
                        </div>
                        <div>
                          <label>Semester</label>
                          <select
                            value={regData.semester}
                            onChange={(e) => setRegData({ ...regData, semester: parseInt(e.target.value, 10) })}
                          >
                            {(() => {
                              const schoolObj = master.schools ? master.schools.find(s => s.id === regData.schoolId || s.code === regData.schoolId) : null;
                              const count = schoolObj ? (schoolObj.semesters || 8) : 8;
                              return Array.from({ length: count }, (_, i) => i + 1).map(s => (
                                <option key={s} value={s}>Semester {s}</option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>

                      {/* Mentor Selection (Mandatory for Student to connect with mentor) */}
                      <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Select Mentor to Connect With *</span>
                          <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 'normal' }}>Required</span>
                        </label>
                        <select
                          value={regData.mentorId}
                          onChange={(e) => setRegData({ ...regData, mentorId: e.target.value })}
                          required
                        >
                          <option value="">-- Choose your Mentor --</option>
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
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          You will be automatically connected to this mentor for academic guidance and review.
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Mentor / Faculty Academic & Department Details */
                    <>
                      <div style={{ marginBottom: '14px' }}>
                        <label>Department</label>
                        <input
                          type="text"
                          name="department"
                          autoComplete="off"
                          placeholder="e.g. Computer Science & Engineering"
                          value={regData.department}
                          onChange={(e) => setRegData({ ...regData, department: e.target.value })}
                          required
                        />
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <label>Designation</label>
                        <input
                          type="text"
                          name="designation"
                          autoComplete="off"
                          placeholder={regData.role === 'mentor' ? 'e.g. Senior Technical Mentor / Alumnus Guide' : 'e.g. Assistant Professor / Associate Professor'}
                          value={regData.designation}
                          onChange={(e) => setRegData({ ...regData, designation: e.target.value })}
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

              <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                Already registered?{' '}
                <a
                  href="#login"
                  onClick={(e) => {
                    e.preventDefault();
                    setIsRegister(false);
                    setStep(1);
                    setError('');
                    setRegData({
                      role: 'student',
                      fullName: '',
                      sapId: '',
                      email: '',
                      password: '',
                      confirmPassword: '',
                      schoolId: master.schools && master.schools[0] ? master.schools[0].id : 'sch-stme',
                      programId: master.programs && master.programs[0] ? master.programs[0].id : 'prog-csds',
                      semester: 1,
                      year: 1,
                      mentorId: master.mentors && master.mentors[0] ? master.mentors[0].user_id : '',
                      department: 'Computer Science & Engineering',
                      designation: 'Assistant Professor'
                    });
                    setEmail('');
                    setPassword('');
                  }}
                  style={{ fontWeight: '600' }}
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
