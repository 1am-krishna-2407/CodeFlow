import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthErrorMessage, signup } from '../services/auth'
import { Banner, Button, Field } from '../components/ui'
import { AuthLayout, EMAIL_PATTERN } from './LoginPage'

export const MIN_PASSWORD_LENGTH = 8

type Errors = { name?: string; email?: string; password?: string; confirm?: string }

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [fieldErrors, setFieldErrors] = useState<Errors>({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const validate = () => {
    const errs: Errors = {}
    if (!form.name.trim()) errs.name = 'Enter your name.'
    if (!EMAIL_PATTERN.test(form.email.trim())) errs.email = 'Enter a valid email address.'
    if (form.password.length < MIN_PASSWORD_LENGTH) errs.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    if (form.confirm !== form.password) errs.confirm = 'Passwords do not match.'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      await signup({ name: form.name.trim(), email: form.email.trim(), password: form.password })
      navigate('/login', { state: { registered: true } })
    } catch (err) {
      setError(getAuthErrorMessage(err, 'register'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start running code in seconds."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></>}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <Banner kind="error">{error}</Banner>
        <Field label="Name" name="name" autoComplete="name" maxLength={128} value={form.name} onChange={set('name')}
          error={fieldErrors.name} autoFocus />
        <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={set('email')}
          error={fieldErrors.email} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" maxLength={128}
          value={form.password} onChange={set('password')} error={fieldErrors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" value={form.confirm}
          onChange={set('confirm')} error={fieldErrors.confirm} />
        <Button type="submit" variant="primary" size="lg" loading={submitting} className="w-full">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  )
}
