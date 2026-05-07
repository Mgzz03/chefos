// ── Simple hardcoded auth (for development / single-user only) ─────
// Change these to your own email and password
const CHEF_EMAIL = "mariamhodaiby2001@gmail.com"
const CHEF_PASSWORD = "merio@2001"

export const validateLogin = (email, password) => {
  return email === CHEF_EMAIL && password === CHEF_PASSWORD
}

export const isLoggedIn = () => {
  // Check if user has logged in this session
  return sessionStorage.getItem('chefos_logged_in') === 'true'
}

export const setLoggedIn = () => {
  sessionStorage.setItem('chefos_logged_in', 'true')
}

export const logout = () => {
  sessionStorage.removeItem('chefos_logged_in')
}
