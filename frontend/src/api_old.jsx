import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000' })

export const getIngredients = () => api.get('/ingredients')
export const createIngredient = (data) => api.post('/ingredients', data)
export const updateIngredient = (id, data) => api.patch(`/ingredients/${id}`, data)

export const getRecipes = () => api.get('/recipes')
export const createRecipe = (data) => api.post('/recipes', data)
export const updateRecipe = (id, data) => api.patch(`/recipes/${id}`, data)
export const deleteRecipe = (id) => api.delete(`/recipes/${id}`)

export const getRecipeCost = (id, scale) => api.get(`/recipes/${id}/cost?scale=${scale}`)
export const simulateCook = (id, scale) => api.get(`/recipes/${id}/simulate?scale=${scale}`)
export const executeCook = (data) => api.post('/cook', data)
export const restockIng = (data) => api.post('/restock', data)
export const getInventory = () => api.get('/inventory')
export const getTransactions = () => api.get('/transactions')

export const updateInventory = (id, data) => api.patch(`/inventory/${id}`, data)