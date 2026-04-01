<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { PaperFilterOptions } from "@/base/filter";
import { debounce } from "@/base/misc";
import { getPublicationString } from "@/base/string";
import { Entity } from "@/models/entity";

const props = defineProps({
  entity: {
    type: Object as () => Entity,
    required: true,
  },
});

const uiSlotState = PLUIAPILocal.uiSlotService.useState();

const relatedEntities = ref<Entity[]>([]);
const searchText = ref("");
const searchResults = ref<Entity[]>([]);
const syncing = ref(false);
const loadingRelatedEntities = ref(false);
const searching = ref(false);
const pendingRelatedPaperId = ref("");
const lastSearchText = ref("");

const canSearch = computed(() => searchText.value.trim().length > 0);
const hasExistingRelatedPapers = computed(() => relatedEntities.value.length > 0);
const hasSearchResults = computed(() => searchResults.value.length > 0);
const hasSearchFeedback = computed(() => {
  return canSearch.value && (searching.value || hasSearchResults.value || !syncing.value);
});

const pushNotification = (title: string, content: string) => {
  const notificationId = `related-paper-${Date.now()}-${Math.random()}`;
  PLUIAPILocal.uiSlotService.updateSlot("overlayNotifications", {
    [notificationId]: { title, content },
  });
};

const formatPublicationMeta = (entity: Entity) => {
  const parts = [entity.year, getPublicationString(entity)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Publication unavailable";
};

const formatAuthors = (authors?: string) => {
  return (authors || "")
    .split(" and ")
    .map((author) => author.trim())
    .filter((author) => author)
    .join(", ");
};

const loadRelatedEntities = async () => {
  if (!props.entity?._id || !props.entity.relatedPaperIds?.length) {
    relatedEntities.value = [];
    return;
  }

  loadingRelatedEntities.value = true;
  try {
    relatedEntities.value = (await PLAPI.paperService.loadByIds(
      props.entity.relatedPaperIds
    )) as Entity[];
  } finally {
    loadingRelatedEntities.value = false;
  }
};

const refreshCurrentEntity = async () => {
  PLUIAPILocal.uiStateService.setState({
    entitiesReloaded: Date.now(),
  });
  await loadRelatedEntities();
};

const updateRelatedPaperIds = async (relatedIds: string[]) => {
  syncing.value = true;
  try {
    await PLAPI.paperService.setRelatedPaperIds(props.entity._id, relatedIds as any);
    await refreshCurrentEntity();
  } finally {
    syncing.value = false;
    pendingRelatedPaperId.value = "";
  }
};

const addRelatedPaper = async (entity: Entity) => {
  pendingRelatedPaperId.value = `${entity._id}`;
  const nextRelatedIds = Array.from(
    new Set([
      ...(props.entity.relatedPaperIds || []).map((id) => `${id}`),
      `${entity._id}`,
    ])
  );

  searchText.value = "";
  searchResults.value = [];
  await updateRelatedPaperIds(nextRelatedIds);
  pushNotification("Related paper added", entity.title || "A related paper was added.");
};

const removeRelatedPaper = async (relatedEntity: Entity) => {
  pendingRelatedPaperId.value = `${relatedEntity._id}`;
  const nextRelatedIds = (props.entity.relatedPaperIds || [])
    .map((id) => `${id}`)
    .filter((id) => id !== `${relatedEntity._id}`);
  await updateRelatedPaperIds(nextRelatedIds);
  pushNotification(
    "Related paper removed",
    relatedEntity.title || "A related paper was removed."
  );
};

const searchRelatedPapers = debounce(async () => {
  const trimmedSearchText = searchText.value.trim();
  lastSearchText.value = trimmedSearchText;

  if (!trimmedSearchText) {
    searchResults.value = [];
    searching.value = false;
    return;
  }

  searching.value = true;
  try {
    const results = (await PLAPI.paperService.load(
      new PaperFilterOptions({
        search: trimmedSearchText,
        searchMode: "general",
        flaged: false,
        tag: "",
        folder: "",
        limit: 8,
      }).toString(),
      "addTime",
      "desc"
    )) as Entity[];

    if (trimmedSearchText !== searchText.value.trim()) {
      return;
    }

    const existingRelatedIds = new Set(
      (props.entity.relatedPaperIds || []).map((id) => `${id}`)
    );

    searchResults.value = results.filter((entity) => {
      return (
        `${entity._id}` !== `${props.entity._id}` &&
        !existingRelatedIds.has(`${entity._id}`)
      );
    });
  } finally {
    if (trimmedSearchText === searchText.value.trim()) {
      searching.value = false;
    }
  }
}, 250);

watch(
  () => [
    `${props.entity?._id || ""}`,
    JSON.stringify((props.entity.relatedPaperIds || []).map((id) => `${id}`)),
  ],
  async () => {
    await loadRelatedEntities();
  },
  { immediate: true }
);

watch(searchText, () => {
  searchRelatedPapers();
});
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="loadingRelatedEntities"
      class="rounded-md border border-dashed border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xxs text-neutral-400 dark:text-neutral-500"
    >
      Loading related papers…
    </div>

    <div v-else-if="!hasExistingRelatedPapers" class="space-y-1">
      <div class="text-xxs text-neutral-400 dark:text-neutral-500">
        {{ $t("mainview.norelatedpapers") }}
      </div>
      <div class="text-[0.65rem] text-neutral-400 dark:text-neutral-500">
        Search below to connect papers that belong in the same reading trail.
      </div>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="relatedEntity in relatedEntities"
        :key="`${relatedEntity._id}`"
        class="group rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/70 px-3 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700/80"
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 grow space-y-1">
            <div class="text-xxs font-medium leading-4 break-words">
              {{ relatedEntity.title }}
            </div>
            <div class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 break-words">
              {{ formatPublicationMeta(relatedEntity) }}
            </div>
            <div
              v-if="relatedEntity.authors"
              class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 truncate"
            >
              {{ formatAuthors(relatedEntity.authors) }}
            </div>
          </div>

          <button
            class="shrink-0 rounded-md border border-transparent px-2 py-1 text-[0.65rem] text-neutral-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-500 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            :disabled="syncing"
            @click="removeRelatedPaper(relatedEntity)"
      >
        <div
          v-if="searching"
          class="px-3 py-2 text-[0.65rem] text-neutral-400 dark:text-neutral-500"
        >
          Searching papers…
        </div>

        <div v-else-if="hasSearchResults" class="max-h-56 overflow-auto p-1">

    <div class="space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
      <div class="flex items-center justify-between gap-2">
        <div class="text-xxs text-neutral-400 dark:text-neutral-500 select-none">
          Add related paper
        </div>
        <div
          v-if="syncing"
          class="text-[0.65rem] text-neutral-400 dark:text-neutral-500"
        >
          Saving relation…
        </div>
      </div>

      <input
        v-model="searchText"
        class="w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xxs focus:border-accentlight focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
        :disabled="syncing"
        :placeholder="$t('mainview.searchrelatedpapers')"
      />

      <div
        v-if="hasSearchFeedback"
        class="rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/70"
      >
        <div
          v-if="searching"
          class="px-3 py-2 text-[0.65rem] text-neutral-400 dark:text-neutral-500"
        >
          Searching papers…
        </div>

        <div v-else-if="hasSearchResults" class="max-h-56 overflow-auto p-1">
          <button
            v-for="result in searchResults"
            :key="`${result._id}`"
            class="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-neutral-100 hover:dark:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="syncing"
            @click="addRelatedPaper(result)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 grow space-y-1">
                <div class="text-xxs font-medium leading-4 break-words">
                  {{ result.title }}
                </div>
                <div class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 break-words">
                  {{ formatPublicationMeta(result) }}
                </div>
                <div
                  v-if="result.authors"
                  class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 truncate"
                >
                  {{ result.authors }}
                </div>
              </div>
              <div class="shrink-0 text-[0.65rem] text-accentlight">
                <span v-if="syncing && pendingRelatedPaperId === `${result._id}`">
                  Adding…
                </span>
                <span v-else>Add</span>
              </div>
            </div>
          </button>
        </div>

        <div
          v-else
          class="px-3 py-2 text-[0.65rem] text-neutral-400 dark:text-neutral-500"
        >
          No matching papers found for “{{ lastSearchText }}”.
        </div>
      </div>
    </div>
  </div>
</template>
