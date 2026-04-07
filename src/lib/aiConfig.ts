// Re-exports localStorage R/W for AI settings — satisfies S2-3 module split
export {
  getUserId,
  getUserApiKey, setUserApiKey,
  getUserModel, setUserModel,
  getUserProvider, setUserProvider,
  getOpenRouterKey, setOpenRouterKey,
  getOpenRouterModel, setOpenRouterModel,
  getGroqKey, setGroqKey,
  getEmbedProvider, setEmbedProvider,
  getEmbedOpenAIKey, setEmbedOpenAIKey,
  getGeminiKey, setGeminiKey,
  getEmbedKey,
  loadTaskModels,
} from "./aiSettings";
