import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/supabase', () => ({
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }, from: vi.fn().mockReturnValue({ upsert: vi.fn() }) },
}));

import {
  getUserApiKey, setUserApiKey,
  getUserModel, setUserModel,
  getUserProvider, setUserProvider,
  getOpenRouterKey, setOpenRouterKey,
  getOpenRouterModel, setOpenRouterModel,
  getGroqKey, setGroqKey,
  getEmbedProvider, setEmbedProvider,
  getEmbedOpenAIKey, setEmbedOpenAIKey,
  getGeminiKey, setGeminiKey,
  getEmbedKey, getEmbedHeaders,
  getModelForTask, setModelForTask,
} from '../../src/lib/aiFetch';

describe('aiFetch settings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('getUserApiKey returns null by default', () => {
    expect(getUserApiKey()).toBeNull();
  });

  it('setUserApiKey stores and retrieves key', () => {
    setUserApiKey('sk-test-123');
    expect(getUserApiKey()).toBe('sk-test-123');
  });

  it('setUserApiKey(null) removes key', () => {
    setUserApiKey('sk-test-123');
    setUserApiKey(null);
    expect(getUserApiKey()).toBeNull();
  });

  it('getUserModel returns default model when not set', () => {
    const model = getUserModel();
    expect(typeof model).toBe('string');
    expect(model.length).toBeGreaterThan(0);
  });

  it('setUserModel stores and retrieves model', () => {
    setUserModel('claude-sonnet-4-6');
    expect(getUserModel()).toBe('claude-sonnet-4-6');
  });

  it('getUserProvider defaults to anthropic', () => {
    expect(getUserProvider()).toBe('anthropic');
  });

  it('setUserProvider stores provider', () => {
    setUserProvider('openrouter');
    expect(getUserProvider()).toBe('openrouter');
  });

  it('getOpenRouterKey returns null by default', () => {
    expect(getOpenRouterKey()).toBeNull();
  });

  it('setOpenRouterKey stores key', () => {
    setOpenRouterKey('or-key');
    expect(getOpenRouterKey()).toBe('or-key');
  });

  it('getOpenRouterModel returns null by default', () => {
    expect(getOpenRouterModel()).toBeNull();
  });

  it('setOpenRouterModel stores model', () => {
    setOpenRouterModel('google/gemini-2.0-flash-exp:free');
    expect(getOpenRouterModel()).toBe('google/gemini-2.0-flash-exp:free');
  });

  it('getGroqKey returns null by default', () => {
    expect(getGroqKey()).toBeNull();
  });

  it('setGroqKey stores key', () => {
    setGroqKey('gsk-test');
    expect(getGroqKey()).toBe('gsk-test');
  });

  it('getEmbedProvider defaults to openai', () => {
    expect(getEmbedProvider()).toBe('openai');
  });

  it('setEmbedProvider stores provider', () => {
    setEmbedProvider('google');
    expect(getEmbedProvider()).toBe('google');
  });

  it('getEmbedOpenAIKey returns null by default', () => {
    expect(getEmbedOpenAIKey()).toBeNull();
  });

  it('setEmbedOpenAIKey stores key', () => {
    setEmbedOpenAIKey('embed-key');
    expect(getEmbedOpenAIKey()).toBe('embed-key');
  });

  it('getGeminiKey returns null by default', () => {
    expect(getGeminiKey()).toBeNull();
  });

  it('setGeminiKey stores key', () => {
    setGeminiKey('gemini-key');
    expect(getGeminiKey()).toBe('gemini-key');
  });

  it('getEmbedKey returns openai key by default', () => {
    setEmbedOpenAIKey('oai-key');
    expect(getEmbedKey()).toBe('oai-key');
  });

  it('getEmbedKey returns google key when provider is google', () => {
    setEmbedProvider('google');
    setGeminiKey('gem-key');
    expect(getEmbedKey()).toBe('gem-key');
  });

  it('getEmbedHeaders returns null when no key set', () => {
    expect(getEmbedHeaders()).toBeNull();
  });

  it('getEmbedHeaders returns headers when key is set', () => {
    setEmbedOpenAIKey('oai-key');
    const headers = getEmbedHeaders();
    expect(headers).toEqual({ 'X-Embed-Provider': 'openai', 'X-Embed-Key': 'oai-key' });
  });

  it('getModelForTask returns null by default', () => {
    expect(getModelForTask('capture')).toBeNull();
  });
});
