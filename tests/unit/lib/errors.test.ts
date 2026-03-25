import { describe, it, expect } from 'vitest';
import {
  AppError,
  GatewayError,
  LLMError,
  SlackError,
  TimeoutError,
  ValidationError,
} from '../../../src/lib/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with code and message', () => {
      const error = new AppError('INTERNAL_ERROR', 'Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppError');
      expect(error.code).toBe('INTERNAL_ERROR');
    });

    it('should create error with details', () => {
      const error = new AppError('INTERNAL_ERROR', 'Test error', 500, { key: 'value' });
      expect(error.details).toEqual({ key: 'value' });
    });

    it('should be instance of Error', () => {
      const error = new AppError('INTERNAL_ERROR', 'Test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have toJSON method', () => {
      const error = new AppError('INTERNAL_ERROR', 'Test error', 500, { extra: 'data' });
      const json = error.toJSON();

      expect(json.success).toBe(false);
      expect(json.error.code).toBe('INTERNAL_ERROR');
      expect(json.error.message).toBe('Test error');
      expect(json.error.details).toEqual({ extra: 'data' });
    });
  });

  describe('GatewayError', () => {
    it('should create gateway error', () => {
      const error = new GatewayError('Gateway failed');
      expect(error.message).toBe('Gateway failed');
      expect(error.name).toBe('GatewayError');
      expect(error.code).toBe('GATEWAY_ERROR');
    });

    it('should include status code in details', () => {
      const error = new GatewayError('Gateway failed', { status: 502 });
      expect(error.details?.status).toBe(502);
    });

    it('should be instance of AppError', () => {
      const error = new GatewayError('Test');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should have default status code 502', () => {
      const error = new GatewayError();
      expect(error.statusCode).toBe(502);
    });
  });

  describe('LLMError', () => {
    it('should create LLM error', () => {
      const error = new LLMError('LLM failed');
      expect(error.message).toBe('LLM failed');
      expect(error.name).toBe('LLMError');
      expect(error.code).toBe('LLM_ERROR');
    });

    it('should include cause in details', () => {
      const error = new LLMError('LLM failed', { cause: 'Invalid JSON' });
      expect(error.details?.cause).toBe('Invalid JSON');
    });
  });

  describe('SlackError', () => {
    it('should create Slack error', () => {
      const error = new SlackError('Slack failed');
      expect(error.message).toBe('Slack failed');
      expect(error.name).toBe('SlackError');
      expect(error.code).toBe('SLACK_ERROR');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error', () => {
      const error = new TimeoutError('Request timed out');
      expect(error.message).toBe('Request timed out');
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT');
    });

    it('should have default status code 504', () => {
      const error = new TimeoutError();
      expect(error.statusCode).toBe(504);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should include field errors in details', () => {
      const error = new ValidationError('Invalid input', {
        fields: { email: 'Invalid email format' },
      });
      expect(error.details?.fields).toEqual({ email: 'Invalid email format' });
    });

    it('should have default status code 400', () => {
      const error = new ValidationError();
      expect(error.statusCode).toBe(400);
    });
  });

  describe('Error inheritance', () => {
    it('all custom errors should extend AppError', () => {
      expect(new GatewayError('test')).toBeInstanceOf(AppError);
      expect(new LLMError('test')).toBeInstanceOf(AppError);
      expect(new SlackError('test')).toBeInstanceOf(AppError);
      expect(new TimeoutError('test')).toBeInstanceOf(AppError);
      expect(new ValidationError('test')).toBeInstanceOf(AppError);
    });

    it('all custom errors should extend Error', () => {
      expect(new GatewayError('test')).toBeInstanceOf(Error);
      expect(new LLMError('test')).toBeInstanceOf(Error);
      expect(new SlackError('test')).toBeInstanceOf(Error);
      expect(new TimeoutError('test')).toBeInstanceOf(Error);
      expect(new ValidationError('test')).toBeInstanceOf(Error);
    });
  });
});
