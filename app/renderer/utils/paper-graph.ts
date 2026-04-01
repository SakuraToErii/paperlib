import { Entity } from "@/models/entity";
import { getFolderShadeKey, getTopLevelFolder, normalizeFolderPath } from "@/base/folder";

export interface PaperGraphNode {
  id: string;
  label: string;
  year: string;
  folderPath: string;
  rootFolder: string;
  relationCount: number;
  radius: number;
  color: string;
  x: number;
  y: number;
}

export interface PaperGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface PaperGraphData {
  nodes: PaperGraphNode[];
  edges: PaperGraphEdge[];
}

const DEFAULT_PALETTE = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

const MONTH_LOOKUP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const hashString = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

const hexToHsl = (hex: string) => {
  const cleaned = hex.replace("#", "");
  const normalized = cleaned.length === 3
    ? cleaned
        .split("")
        .map((char) => `${char}${char}`)
        .join("")
    : cleaned;

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { hue: 0, saturation: 0, lightness: lightness * 100 };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue = 0;
  switch (max) {
    case red:
      hue = (green - blue) / delta + (green < blue ? 6 : 0);
      break;
    case green:
      hue = (blue - red) / delta + 2;
      break;
    default:
      hue = (red - green) / delta + 4;
      break;
  }

  return {
    hue: hue * 60,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
};

const hslToCss = ({
  hue,
  saturation,
  lightness,
}: {
  hue: number;
  saturation: number;
  lightness: number;
}) => {
  return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
};

export const getCanonicalFolderPath = (entity: Entity) => {
  return entity.folders
    .map((folder) => normalizeFolderPath(folder.name))
    .filter((folderPath) => folderPath)
    .sort((left, right) => right.length - left.length)[0] || "";
};

export const parsePalette = (palette?: string) => {
  const parsed = (palette || "")
    .split(",")
    .map((color) => color.trim())
    .filter((color) => /^#?[0-9a-fA-F]{6}$/.test(color))
    .map((color) => (color.startsWith("#") ? color : `#${color}`));

  return parsed.length > 0 ? parsed : DEFAULT_PALETTE;
};

const getPublicationSortKey = (entity: Entity) => {
  const year = Number.parseInt(entity.year || "", 10);
  const normalizedMonth = (entity.month || "").trim().toLowerCase();
  const numericMonth = Number.parseInt(normalizedMonth, 10);
  const month =
    MONTH_LOOKUP[normalizedMonth] ||
    (Number.isFinite(numericMonth) ? clamp(numericMonth, 1, 12) : 12);
  const validYear = Number.isFinite(year) ? year : 9999;
  const validAddTime = entity.addTime instanceof Date ? entity.addTime.getTime() : 0;

  return [validYear, month, validAddTime, `${entity._id}`];
};

export const compareByPublicationTime = (left: Entity, right: Entity) => {
  const leftKey = getPublicationSortKey(left);
  const rightKey = getPublicationSortKey(right);

  for (let index = 0; index < leftKey.length; index += 1) {
    if (leftKey[index] < rightKey[index]) {
      return -1;
    }
    if (leftKey[index] > rightKey[index]) {
      return 1;
    }
  }

  return 0;
};

const buildColorMap = (entities: Entity[], customPalette?: string) => {
  const palette = parsePalette(customPalette);
  const rootFolders = Array.from(
    new Set(
      entities
        .map((entity) => getTopLevelFolder(getCanonicalFolderPath(entity)))
        .filter((folder) => folder)
    )
  ).sort((left, right) => left.localeCompare(right));

  return rootFolders.reduce((accumulator, rootFolder, index) => {
    accumulator[rootFolder] = palette[index % palette.length];
    return accumulator;
  }, {} as Record<string, string>);
};

const getNodeColor = (
  entity: Entity,
  colorMap: Record<string, string>,
  entitiesByRootFolder: Record<string, string[]>
) => {
  const folderPath = getCanonicalFolderPath(entity);
  const rootFolder = getTopLevelFolder(folderPath);
  const baseColor = colorMap[rootFolder] || DEFAULT_PALETTE[0];
  const { hue, saturation, lightness } = hexToHsl(baseColor);

  if (!rootFolder) {
    return hslToCss({
      hue,
      saturation: Math.max(20, saturation - 25),
      lightness: 60,
    });
  }

  const shadeKey = getFolderShadeKey(folderPath);
  const variants = entitiesByRootFolder[rootFolder] || [];
  const variantIndex = shadeKey
    ? variants.indexOf(shadeKey)
    : Math.max(0, Math.floor(variants.length / 2));
  const depthShift = shadeKey
    ? ((variantIndex >= 0 ? variantIndex : hashString(shadeKey)) % Math.max(variants.length || 1, 1))
    : 0;

  return hslToCss({
    hue,
    saturation: clamp(saturation - depthShift * 2, 36, 86),
    lightness: clamp(lightness + depthShift * 5 - (folderPath ? 4 : 0), 28, 72),
  });
};

const buildShadeVariants = (entities: Entity[]) => {
  return entities.reduce((accumulator, entity) => {
    const folderPath = getCanonicalFolderPath(entity);
    const rootFolder = getTopLevelFolder(folderPath);
    const shadeKey = getFolderShadeKey(folderPath);

    if (!rootFolder) {
      return accumulator;
    }

    if (!accumulator[rootFolder]) {
      accumulator[rootFolder] = [];
    }

    if (shadeKey && !accumulator[rootFolder].includes(shadeKey)) {
      accumulator[rootFolder].push(shadeKey);
      accumulator[rootFolder].sort((left, right) => left.localeCompare(right));
    }

    return accumulator;
  }, {} as Record<string, string[]>);
};

const buildNeighborhoodNodeIdSet = (
  graph: PaperGraphData,
  selectedPaperId?: string
) => {
  if (!selectedPaperId) {
    return new Set<string>();
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (!nodeIds.has(selectedPaperId)) {
    return new Set<string>();
  }

  const neighborhoodNodeIds = new Set<string>([selectedPaperId]);

  for (const edge of graph.edges) {
    if (edge.source === selectedPaperId && nodeIds.has(edge.target)) {
      neighborhoodNodeIds.add(edge.target);
    }

    if (edge.target === selectedPaperId && nodeIds.has(edge.source)) {
      neighborhoodNodeIds.add(edge.source);
    }
  }

  return neighborhoodNodeIds;
};

export const getPaperGraphNeighborhood = (
  graph: PaperGraphData,
  selectedPaperId?: string
): PaperGraphData => {
  const neighborhoodNodeIds = buildNeighborhoodNodeIdSet(graph, selectedPaperId);
  if (neighborhoodNodeIds.size === 0) {
    return {
      nodes: [...graph.nodes],
      edges: [...graph.edges],
    };
  }

  return {
    nodes: graph.nodes.filter((node) => neighborhoodNodeIds.has(node.id)),
    edges: graph.edges.filter((edge) => {
      return neighborhoodNodeIds.has(edge.source) && neighborhoodNodeIds.has(edge.target);
    }),
  };
};

export const buildPaperGraph = (entities: Entity[], customPalette?: string) => {
  const entitiesById = entities.reduce((accumulator, entity) => {
    accumulator[`${entity._id}`] = entity;
    return accumulator;
  }, {} as Record<string, Entity>);

  const uniqueEdges = new Map<string, PaperGraphEdge>();
  const relationCounts = new Map<string, number>();

  for (const entity of entities) {
    relationCounts.set(`${entity._id}`, 0);
  }

  for (const entity of entities) {
    const entityId = `${entity._id}`;

    for (const relatedPaperId of entity.relatedPaperIds || []) {
      const relatedEntity = entitiesById[`${relatedPaperId}`];
      if (!relatedEntity) {
        continue;
      }

      const relatedEntityId = `${relatedEntity._id}`;
      if (relatedEntityId === entityId) {
        continue;
      }

      const pair = [entityId, relatedEntityId].sort();
      const pairId = pair.join("::");
      if (uniqueEdges.has(pairId)) {
        continue;
      }

      const [olderEntity, newerEntity] =
        compareByPublicationTime(entity, relatedEntity) <= 0
          ? [entity, relatedEntity]
          : [relatedEntity, entity];

      uniqueEdges.set(pairId, {
        id: pairId,
        source: `${olderEntity._id}`,
        target: `${newerEntity._id}`,
      });

      relationCounts.set(entityId, (relationCounts.get(entityId) || 0) + 1);
      relationCounts.set(
        relatedEntityId,
        (relationCounts.get(relatedEntityId) || 0) + 1
      );
    }
  }

  const colorMap = buildColorMap(entities, customPalette);
  const shadeVariants = buildShadeVariants(entities);

  const nodes = entities.map((entity, index) => {
    const folderPath = getCanonicalFolderPath(entity);
    const relationCount = relationCounts.get(`${entity._id}`) || 0;
    const angle = (index / Math.max(entities.length, 1)) * Math.PI * 2;
    const radius = 220 + relationCount * 10;

    return {
      id: `${entity._id}`,
      label: entity.title || "Untitled",
      year: entity.year || "",
      folderPath,
      rootFolder: getTopLevelFolder(folderPath),
      relationCount,
      radius: clamp(10 + Math.sqrt(relationCount) * 5, 10, 28),
      color: getNodeColor(entity, colorMap, shadeVariants),
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    } as PaperGraphNode;
  });

  return {
    nodes,
    edges: Array.from(uniqueEdges.values()),
    colorMap,
  };
};

export const layoutPaperGraph = (
  nodes: PaperGraphNode[],
  edges: PaperGraphEdge[],
  iterations = 180
) => {
  const nextNodes = nodes.map((node) => ({ ...node }));
  const nodeMap = nextNodes.reduce((accumulator, node) => {
    accumulator[node.id] = node;
    return accumulator;
  }, {} as Record<string, PaperGraphNode>);

  const desiredDistance = 120;
  const repulsion = 16000;
  const attraction = 0.03;
  const centerPull = 0.006;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const velocity = nextNodes.reduce((accumulator, node) => {
      accumulator[node.id] = { x: 0, y: 0 };
      return accumulator;
    }, {} as Record<string, { x: number; y: number }>);

    for (let index = 0; index < nextNodes.length; index += 1) {
      const source = nextNodes[index];
      for (let compareIndex = index + 1; compareIndex < nextNodes.length; compareIndex += 1) {
        const target = nextNodes[compareIndex];
        const deltaX = source.x - target.x;
        const deltaY = source.y - target.y;
        const distanceSquared = Math.max(deltaX * deltaX + deltaY * deltaY, 1);
        const distance = Math.sqrt(distanceSquared);
        const force = repulsion / distanceSquared;
        const offsetX = (deltaX / distance) * force;
        const offsetY = (deltaY / distance) * force;

        velocity[source.id].x += offsetX;
        velocity[source.id].y += offsetY;
        velocity[target.id].x -= offsetX;
        velocity[target.id].y -= offsetY;
      }
    }

    for (const edge of edges) {
      const source = nodeMap[edge.source];
      const target = nodeMap[edge.target];
      if (!source || !target) {
        continue;
      }

      const deltaX = target.x - source.x;
      const deltaY = target.y - source.y;
      const distance = Math.max(Math.sqrt(deltaX * deltaX + deltaY * deltaY), 1);
      const force = (distance - desiredDistance) * attraction;
      const offsetX = (deltaX / distance) * force;
      const offsetY = (deltaY / distance) * force;

      velocity[source.id].x += offsetX;
      velocity[source.id].y += offsetY;
      velocity[target.id].x -= offsetX;
      velocity[target.id].y -= offsetY;
    }

    for (const node of nextNodes) {
      velocity[node.id].x += -node.x * centerPull;
      velocity[node.id].y += -node.y * centerPull;
      node.x += velocity[node.id].x;
      node.y += velocity[node.id].y;
    }
  }

  return nextNodes;
};
