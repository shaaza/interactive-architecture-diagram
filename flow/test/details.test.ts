import { describe, expect, it } from 'vitest';
import {
  DetailsError,
  findEdgeDetails,
  humanize,
  normalizeEdgeKey,
  parseDetails,
  resolveType,
} from '../src/details/schema';
import { EXAMPLES } from '../src/examples';

describe('parseDetails', () => {
  it('returns built-in types for empty text', () => {
    const doc = parseDetails('  \n');
    expect(doc.nodes.size).toBe(0);
    expect(doc.types.get('service')?.label).toBe('Service');
  });

  it('splits node keys into known fields and parameters', () => {
    const doc = parseDetails(`
nodes:
  API:
    type: service
    name: Orders API
    description: Owns orders
    language: Go
    replicas: 3
    deploy: { platform: ECS }
`);
    expect(doc.nodes.get('API')).toEqual({
      type: 'service',
      name: 'Orders API',
      description: 'Owns orders',
      params: { language: 'Go', replicas: 3 },
      deploy: { platform: 'ECS' },
      locked: false,
    });
  });

  it('reads edge fields and keeps the rest as extra', () => {
    const doc = parseDetails(`
edges:
  "2":
    method: post
    endpoint: /orders
    headers: { Authorization: Bearer x }
    timeout: 3s
`);
    const edge = doc.edges.get('2');
    expect(edge?.method).toBe('POST');
    expect(edge?.endpoint).toBe('/orders');
    expect(edge?.headers).toEqual({ Authorization: 'Bearer x' });
    expect(edge?.extra).toEqual({ timeout: '3s' });
  });

  it('lets custom types extend and override the built-ins', () => {
    const doc = parseDetails(`
types:
  service: { label: Microservice, color: "#0a7", fields: [team, { key: slo, label: SLO target }] }
  lambda: { fields: [runtime] }
`);
    expect(doc.types.get('service')).toEqual({
      label: 'Microservice',
      color: '#0a7',
      fields: [
        { key: 'team', label: 'Team' },
        { key: 'slo', label: 'SLO target' },
      ],
    });
    expect(doc.types.get('lambda')?.label).toBe('Lambda');
    expect(doc.types.get('database')?.label).toBe('Database');
  });

  it('accepts JSON', () => {
    const doc = parseDetails('{"nodes": {"A": {"type": "cache"}}}');
    expect(doc.nodes.get('A')?.type).toBe('cache');
  });

  it.each([
    ['nodes:\n  A: [1, 2', /unexpected end|flow collection/i],
    ['node:\n  A: {}', /Unknown section "node"/],
    ['nodes: [A, B]', /nodes should be a mapping/],
    ['nodes:\n  A: text', /nodes\.A should be a mapping/],
    ['types:\n  svc: { fields: language }', /types\.svc\.fields should be a list/],
    ['nodes:\n  A: { type: [x] }', /nodes\.A\.type should be text/],
  ])('reports a readable error for %j', (text, message) => {
    expect(() => parseDetails(text)).toThrow(DetailsError);
    expect(() => parseDetails(text)).toThrow(message);
  });

  it('parses every example', () => {
    for (const [name, example] of Object.entries(EXAMPLES)) {
      expect(() => parseDetails(example.details), name).not.toThrow();
    }
  });
});

describe('findEdgeDetails', () => {
  const doc = parseDetails(`
edges:
  "6": { endpoint: /by-step }
  GW -> User: { endpoint: /by-route }
  2A: { endpoint: /lettered }
`);

  it('prefers an exact From->To entry over the step number', () => {
    expect(findEdgeDetails(doc, { fromId: 'GW', toId: 'User', step: '6' })?.endpoint).toBe('/by-route');
    expect(findEdgeDetails(doc, { fromId: 'Orders', toId: 'Q', step: '6' })?.endpoint).toBe('/by-step');
  });

  it('matches step numbers case-insensitively', () => {
    expect(findEdgeDetails(doc, { fromId: 'A', toId: 'B', step: '2a' })?.endpoint).toBe('/lettered');
  });

  it('returns null for an unnumbered edge without a route entry', () => {
    expect(findEdgeDetails(doc, { fromId: 'A', toId: 'B', step: null })).toBeNull();
  });
});

describe('helpers', () => {
  it('humanizes keys', () => {
    expect(humanize('rateLimit')).toBe('Rate limit');
    expect(humanize('rate_limit')).toBe('Rate limit');
    expect(humanize('url')).toBe('Url');
  });

  it('normalises edge keys', () => {
    expect(normalizeEdgeKey(' GW -> User ')).toBe('GW->User');
    expect(normalizeEdgeKey('2A')).toBe('2a');
  });

  it('resolves unknown types to a labelled type with no fields', () => {
    const doc = parseDetails('');
    expect(resolveType(doc, 'edge_router')).toEqual({ label: 'Edge router', fields: [] });
    expect(resolveType(doc, undefined)).toBeNull();
  });
});
