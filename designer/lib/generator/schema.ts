/**
 * JSON schema for the course the LLM must return.
 *
 * The LLM emits simple rect-based geometry (matching the ExportHole format);
 * the designer's import path converts these to vector paths so every shape is
 * fully editable after generation.
 *
 * Coordinates are absolute in a large world canvas (one-big-map layout).
 * Holes are routed so the green of hole N sits near the tee of hole N+1.
 */
export const COURSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseName', 'designer', 'worldWidth', 'worldHeight', 'holes'],
  properties: {
    courseName: { type: 'string' },
    designer: { type: 'string' },
    worldWidth: {
      type: 'number',
      description: 'Total width of the big-map canvas in world units.',
    },
    worldHeight: {
      type: 'number',
      description: 'Total height of the big-map canvas in world units.',
    },
    holes: {
      type: 'array',
      minItems: 1,
      maxItems: 18,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'name',
          'par',
          'ballStart',
          'cup',
          'background',
          'terrain',
          'slopes',
          'obstacles',
          'hazards',
        ],
        properties: {
          id: { type: 'integer', minimum: 1 },
          name: { type: 'string' },
          par: { type: 'integer', enum: [3, 4, 5] },
          ballStart: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          cup: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: {
              x: { type: 'number' },
              y: { type: 'number' },
            },
          },
          background: {
            type: 'string',
            enum: ['rough', 'deepRough', 'desert'],
            description: 'Backdrop surface surrounding the hole corridor.',
          },
          terrain: {
            type: 'object',
            additionalProperties: false,
            required: ['tee', 'fairway', 'green', 'rough', 'deepRough', 'desert'],
            properties: {
              tee: {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y', 'w', 'h', 'r'],
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  w: { type: 'number', minimum: 16, maximum: 60 },
                  h: { type: 'number', minimum: 12, maximum: 40 },
                  r: { type: 'number', minimum: 2, maximum: 12 },
                },
              },
              fairway: {
                type: 'array',
                minItems: 1,
                maxItems: 8,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y', 'w', 'h', 'r'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    w: { type: 'number', minimum: 30 },
                    h: { type: 'number', minimum: 30 },
                    r: { type: 'number', minimum: 4, maximum: 40 },
                  },
                },
              },
              green: {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y', 'w', 'h', 'r'],
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  w: { type: 'number', minimum: 40, maximum: 180 },
                  h: { type: 'number', minimum: 40, maximum: 180 },
                  r: { type: 'number', minimum: 8, maximum: 60 },
                },
              },
              rough: {
                type: 'array',
                maxItems: 6,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y', 'w', 'h', 'r'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    w: { type: 'number', minimum: 20 },
                    h: { type: 'number', minimum: 20 },
                    r: { type: 'number', minimum: 0, maximum: 40 },
                  },
                },
              },
              deepRough: {
                type: 'array',
                maxItems: 6,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y', 'w', 'h', 'r'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    w: { type: 'number', minimum: 20 },
                    h: { type: 'number', minimum: 20 },
                    r: { type: 'number', minimum: 0, maximum: 40 },
                  },
                },
              },
              desert: {
                type: 'array',
                maxItems: 6,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y', 'w', 'h', 'r'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    w: { type: 'number', minimum: 20 },
                    h: { type: 'number', minimum: 20 },
                    r: { type: 'number', minimum: 0, maximum: 40 },
                  },
                },
              },
            },
          },
          slopes: {
            type: 'array',
            maxItems: 6,
            description:
              'Green slopes. cx/cy are 0-1 fractions within the green bounding box. Use up to 3 for championship greens.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['cx', 'cy', 'strength', 'dir'],
              properties: {
                cx: { type: 'number', minimum: 0, maximum: 1 },
                cy: { type: 'number', minimum: 0, maximum: 1 },
                strength: { type: 'number', minimum: 0.1, maximum: 1 },
                dir: {
                  type: 'string',
                  enum: ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'],
                },
              },
            },
          },
          obstacles: {
            type: 'array',
            maxItems: 30,
            description: 'Trees only. type must be "circle". look must be one of the planet-allowed tree types.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'x', 'y', 'r', 'look'],
              properties: {
                type: { type: 'string', enum: ['circle'] },
                x: { type: 'number' },
                y: { type: 'number' },
                r: { type: 'number', minimum: 6, maximum: 20 },
                look: {
                  type: 'string',
                  enum: ['pine', 'oak', 'palm', 'birch', 'cypress'],
                },
              },
            },
          },
          hazards: {
            type: 'array',
            maxItems: 12,
            description: 'Sand (sandRect) and water (waterRect) hazards.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'x', 'y', 'w', 'h'],
              properties: {
                type: { type: 'string', enum: ['sandRect', 'waterRect'] },
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number', minimum: 10 },
                h: { type: 'number', minimum: 10 },
              },
            },
          },
        },
      },
    },
  },
} as const;
