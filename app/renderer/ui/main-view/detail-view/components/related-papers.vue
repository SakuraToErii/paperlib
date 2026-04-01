<script setup lang="ts">
import { watch, ref } from "vue";

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

const relatedEntities = ref<Entity[]>([]);
const searchText = ref("");
const searchResults = ref<Entity[]>([]);
const syncing = ref(false);

const loadRelatedEntities = async () => {
  if (!props.entity?._id || !props.entity.relatedPaperIds?.length) {
    relatedEntities.value = [];
    return;
  }

  relatedEntities.value = (await PLAPI.paperService.loadByIds(
    props.entity.relatedPaperIds
  )) as Entity[];
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
  }
};

const addRelatedPaper = async (entity: Entity) => {
  const nextRelatedIds = Array.from(
    new Set([
      ...(props.entity.relatedPaperIds || []).map((id) => `${id}`),
      `${entity._id}`,
    ])
  );

  searchText.value = "";
  searchResults.value = [];
  await updateRelatedPaperIds(nextRelatedIds);
};

const removeRelatedPaper = async (relatedId: string) => {
  const nextRelatedIds = (props.entity.relatedPaperIds || [])
    .map((id) => `${id}`)
    .filter((id) => id !== relatedId);
  await updateRelatedPaperIds(nextRelatedIds);
};

const searchRelatedPapers = debounce(async () => {
  if (!searchText.value.trim()) {
    searchResults.value = [];
    return;
  }

  const results = (await PLAPI.paperService.load(
    new PaperFilterOptions({
      search: searchText.value,
      searchMode: "general",
      flaged: false,
      tag: "",
      folder: "",
      limit: 6,
    }).toString(),
    "addTime",
    "desc"
  )) as Entity[];

  const existingRelatedIds = new Set(
    (props.entity.relatedPaperIds || []).map((id) => `${id}`)
  );

  searchResults.value = results.filter((entity) => {
    return (
      `${entity._id}` !== `${props.entity._id}` &&
      !existingRelatedIds.has(`${entity._id}`)
    );
  });
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
  <div class="space-y-2">
    <div
      v-if="relatedEntities.length === 0"
      class="text-xxs text-neutral-400 dark:text-neutral-500"
    >
      {{ $t("mainview.norelatedpapers") }}
    </div>

    <div class="space-y-1" v-else>
      <div
        v-for="relatedEntity in relatedEntities"
        :key="`${relatedEntity._id}`"
        class="flex items-start justify-between gap-2 rounded-md bg-neutral-100 dark:bg-neutral-700 px-2 py-1"
      >
        <div class="min-w-0">
          <div class="text-xxs font-medium truncate">
            {{ relatedEntity.title }}
          </div>
          <div class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 truncate">
            {{ relatedEntity.year }} · {{ getPublicationString(relatedEntity) }}
          </div>
        </div>
        <button
          class="text-[0.65rem] text-neutral-400 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400 transition-colors"
          :disabled="syncing"
          @click="removeRelatedPaper(`${relatedEntity._id}`)"
        >
          ×
        </button>
      </div>
    </div>

    <div class="space-y-1 pt-1">
      <input
        v-model="searchText"
        class="w-full rounded-md px-2 py-1 text-xxs bg-neutral-200 dark:bg-neutral-700 focus:outline-none"
        :placeholder="$t('mainview.searchrelatedpapers')"
      />

      <div
        v-if="searchResults.length > 0"
        class="space-y-1 rounded-md border border-neutral-200 dark:border-neutral-700 p-1"
      >
        <button
          v-for="result in searchResults"
          :key="`${result._id}`"
          class="w-full text-left rounded-md px-2 py-1 hover:bg-neutral-100 hover:dark:bg-neutral-700 transition-colors"
          :disabled="syncing"
          @click="addRelatedPaper(result)"
        >
          <div class="text-xxs font-medium truncate">
            {{ result.title }}
          </div>
          <div class="text-[0.65rem] text-neutral-400 dark:text-neutral-500 truncate">
            {{ result.year }} · {{ getPublicationString(result) }}
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
