/**
 * JSON schema for the course the LLM must return.
 *
 * The LLM emits:
 *   - hole-level routingAngle so holes don't all align axis-parallel
 *   - a fairwayPath of waypoints (chained capsules) instead of axis-aligned rect segments
 *   - per-surface shape preset + rotation (15° increments)
 *   - circular/oval hazards + trees
 *
 * The import path converts all of this into editable vector paths.
 */

const ROTATION_FIELD = {
  type: 'integer',
  enum: [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345],
  description: 'Rotation in degrees (multiples of 15). 0 = axis-aligned.',
};

const RECT_WITH_ROTATION = (
  shapeEnum: readonly string[],
  extraProps: Record<string, unknown> = {},
  minW = 20,
  minH = 20,
) => ({
  type: 'object',
  additionalProperties: false,
  required: ['x', 'y', 'w', 'h', 'r', 'shape', 'rotation', ...Object.keys(extraProps)],
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number', minimum: minW },
    h: { type: 'number', minimum: minH },
    r: { type: 'number', minimum: 0, maximum: 60 },
    shape: { type: 'string', enum: shapeEnum },
    rotation: ROTATION_FIELD,
    ...extraProps,
  },
});

export const COURSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseName', 'designer', 'worldWidth', 'worldHeight', 'holes'],
  properties: {
    courseName: { type: 'string' },
    designer: { type: 'string' },
    worldWidth: { type: 'number' },
    worldHeight: { type: 'number' },
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
          'designIntent',
          'routingAngle',
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
          designIntent: {
            type: 'string',
            description:
              'One-sentence architectural intent. E.g. "Dogleg-right short par 4; fairway bunker guards the aggressive line, crossing water at 120y.". Drives you to think structurally before emitting geometry.',
          },
          routingAngle: {
            ...ROTATION_FIELD,
            description:
              'Rotation (0/15/30/.../345) applied to the entire hole around its centroid after layout. VARY this across holes — consecutive holes MUST use different routing angles so the map does not look gridded.',
          },
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
          },
          terrain: {
            type: 'object',
            additionalProperties: false,
            required: ['tee', 'fairwayPath', 'fairwayWidth', 'green', 'rough', 'deepRough', 'desert'],
            properties: {
              tee: RECT_WITH_ROTATION(['rectangle', 'capsule'], {}, 16, 12),
              fairwayPath: {
                type: 'array',
                minItems: 4,
                maxItems: 10,
                description:
                  'Polyline of waypoints from tee to just short of green. The import path turns each consecutive pair into an angled capsule. USE THE BENDS — doglegs and curving corridors are what make a hole great. First waypoint sits in the tee area; last waypoint sits just before the green.',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['x', 'y'],
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                  },
                },
              },
              fairwayWidth: {
                type: 'number',
                minimum: 30,
                maximum: 60,
                description:
                  'Fairway capsule width across all waypoints. Narrower = harder. 30–36 championship, 36–42 standard, 42–50 casual.',
              },
              green: {
                type: 'object',
                additionalProperties: false,
                required: ['x', 'y', 'w', 'h', 'r', 'shape', 'rotation'],
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  w: { type: 'number', minimum: 40, maximum: 180 },
                  h: { type: 'number', minimum: 40, maximum: 180 },
                  r: { type: 'number', minimum: 8, maximum: 60 },
                  shape: {
                    type: 'string',
                    enum: ['oval', 'squircle', 'circle', 'capsule'],
                    description: 'Greens ALWAYS oval/squircle/circle. NEVER rectangle.',
                  },
                  rotation: ROTATION_FIELD,
                },
              },
              rough: {
                type: 'array',
                minItems: 2,
                maxItems: 10,
                items: RECT_WITH_ROTATION(['oval', 'squircle', 'capsule', 'rectangle']),
              },
              deepRough: {
                type: 'array',
                maxItems: 10,
                items: RECT_WITH_ROTATION(['oval', 'squircle', 'capsule', 'rectangle']),
              },
              desert: {
                type: 'array',
                maxItems: 14,
                items: RECT_WITH_ROTATION(['squircle', 'oval', 'capsule', 'rectangle']),
              },
            },
          },
          slopes: {
            type: 'array',
            minItems: 2,
            maxItems: 6,
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
            maxItems: 60,
            description:
              'Trees only. Cluster in groups of 3–6 along fairway edges. Empty array only if planet has no flora.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'x', 'y', 'r', 'look'],
              properties: {
                type: { type: 'string', enum: ['circle'] },
                x: { type: 'number' },
                y: { type: 'number' },
                r: { type: 'number', minimum: 6, maximum: 22 },
                look: {
                  type: 'string',
                  enum: ['pine', 'oak', 'palm', 'birch', 'cypress'],
                },
              },
            },
          },
          hazards: {
            type: 'array',
            minItems: 6,
            maxItems: 30,
            description:
              'Sand (sandRect) and water (waterRect) hazards. AT LEAST 6 per hole: 2–4 fairway bunkers + 2–4 greenside + optional water. Bunkers in CLUSTERS of 2–3 small bunkers, not single big ones.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'x', 'y', 'w', 'h', 'shape', 'rotation'],
              properties: {
                type: { type: 'string', enum: ['sandRect', 'waterRect'] },
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number', minimum: 10 },
                h: { type: 'number', minimum: 10 },
                shape: {
                  type: 'string',
                  enum: ['circle', 'oval', 'squircle', 'capsule', 'diamond', 'rectangle'],
                  description: 'Bunkers: circle/oval/squircle. Water: squircle/oval/capsule.',
                },
                rotation: ROTATION_FIELD,
              },
            },
          },
        },
      },
    },
  },
} as const;
