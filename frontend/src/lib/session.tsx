import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasUsableSession, logout as clearTokens, setTokens, Tokens } from '../services/auth'
import { CurrentUser, getMe, revokeSession, SESSION_EXPIRED_EVENT } from '../services/api'

interface Session {
  authed: boolean
  user: CurrentUser | null
  signIn: (tokens: Tokens) => void
  signOut: () => Promise<void>
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(hasUsableSession())
  const [user, setUser] = useState<CurrentUser | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!authed) {
      setUser(null)
      return
    }
    getMe().then(setUser).catch(() => setUser(null))
  }, [authed])

  const signIn = useCallback((tokens: Tokens) => {
    setTokens(tokens)
    setAuthed(true)
  }, [])

  // Explicit log out: revoke on the server so a copied token can't be reused.
  const signOut = useCallback(async () => {
    await revokeSession()
    clearTokens()
    setAuthed(false)
    navigate('/login', { replace: true })
  }, [navigate])

  // Fired by the API client when a 401 can't be fixed by refreshing.
  useEffect(() => {
    const onExpired = () => {
      clearTokens()
      setAuthed(false)
      navigate('/login', { replace: true, state: { expired: true } })
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [navigate])

  return <SessionContext.Provider value={{ authed, user, signIn, signOut }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
