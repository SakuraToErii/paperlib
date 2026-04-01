<script setup lang="ts">
import { Ref, inject, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isEqual } from "lodash";

import { disposable } from "@/base/dispose";
import { eraseProtocol } from "@/base/url";
import { CategorizerMenuItem, CategorizerType } from "@/models/categorizer";
import { FieldTemplate } from "@/renderer/types/data-view";
import { Entity, IEntityCollection } from "@/models/entity";

import PaperGraphView from "./components/graph-view/paper-graph-view.vue";
import ListView from "./components/list-view/list-view.vue";
import TablePreviewView from "./components/table-view/table-preview-view.vue";
import TableView from "./components/table-view/table-view.vue";

// ================================
// State
// ================================
const prefState = PLMainAPI.preferenceService.useState();
const uiState = PLUIAPILocal.uiStateService.useState();

const i18n = useI18n();

const itemSize = ref(28);

// ================================
// Data
// ================================
const paperEntities = inject<Ref<IEntityCollection>>("paperEntities")!;
const displayingURL = ref("");

const pushNotification = (title: string, content: string) => {
  const notificationId = `batch-related-paper-${Date.now()}-${Math.random()}`;
  PLUIAPILocal.uiSlotService.updateSlot("overlayNotifications", {
    [notificationId]: { title, content },
  });
};

const getSelectedPaperEntities = (selectedList: number[]) => {
  return selectedList
    .map((index) => paperEntities.value[index])
    .filter((paper): paper is Entity => Boolean(paper));
};

const getSelectedPaperIds = (selectedList: number[]) => {
  return getSelectedPaperEntities(selectedList).map((paper) => paper._id);
};

const canRelateSelection = (selectedList: number[]) => {
  return getSelectedPaperIds(selectedList).length >= 2;
};

const canUnrelateSelection = (selectedList: number[]) => {
  const selectedPaperEntities = getSelectedPaperEntities(selectedList);
  if (selectedPaperEntities.length < 2) {
    return false;
  }

  const selectedPaperIdSet = new Set(
    selectedPaperEntities.map((paper) => `${paper._id}`)
  );

  return selectedPaperEntities.some((paper) =>
    (paper.relatedPaperIds || []).some((relatedPaperId) =>
      selectedPaperIdSet.has(`${relatedPaperId}`)
    )
  );
};

const relateSelectedPapers = async (selectedList: number[]) => {
  const selectedPaperIds = getSelectedPaperIds(selectedList);
  if (selectedPaperIds.length < 2) {
    return;
  }

  try {
    await PLAPI.paperService.relateSelectedPapers(selectedPaperIds as any);
    PLUIAPILocal.uiStateService.setState({ entitiesReloaded: Date.now() });
    pushNotification(
      "Related papers updated",
      `${selectedPaperIds.length} papers are now related.`
    );
  } catch (error) {
    pushNotification(
      "Failed to relate papers",
      error instanceof Error ? error.message : "Unable to update paper relations."
    );
  }
};

const unrelateSelectedPapers = async (selectedList: number[]) => {
  const selectedPaperIds = getSelectedPaperIds(selectedList);
  if (selectedPaperIds.length < 2) {
    return;
  }

  try {
    await PLAPI.paperService.unrelateSelectedPapers(selectedPaperIds as any);
    PLUIAPILocal.uiStateService.setState({ entitiesReloaded: Date.now() });
    pushNotification(
      "Related papers updated",
      `Removed relations within ${selectedPaperIds.length} selected papers.`
    );
  } catch (error) {
    pushNotification(
      "Failed to unrelate papers",
      error instanceof Error ? error.message : "Unable to update paper relations."
    );
  }
};

// For List View
const fieldEnables = ref({});
const computeFieldEnables = () => {
  const fieldPrefs = prefState.mainTableFields;
  for (const fieldPref of fieldPrefs) {
    fieldEnables.value[fieldPref.key] = fieldPref.enable;
  }
};

// For Table View
const fieldTemplates: Ref<Map<string, FieldTemplate>> = ref(new Map());
const computeFieldTemplates = () => {
  fieldTemplates.value.clear();

  const fieldPrefs = prefState.mainTableFields;

  // 1. Calculate auto width.
  let totalWidth = 0;
  let autoWidthCount = 0;
  for (const fieldPref of fieldPrefs) {
    const width = fieldPref.width;
    const enable = fieldPref.enable;
    if (!enable) {
      continue;
    }
    if (width !== -1) {
      totalWidth += width;
    } else {
      autoWidthCount += 1;
    }
  }
  const autoWidth = (100 - totalWidth) / autoWidthCount;

  // 2. Compute field templates.
  const templateTypes = {
    title: "html",
    rating: "rating",
    flag: "flag",
    defaultSup: "file",
  };

  // 3. Add rest width to the first field.
  let restWidth = 100;
  for (const fieldPref of fieldPrefs) {
    if (!fieldPref.enable) {
      fieldTemplates.value.delete(fieldPref.key);
      continue;
    }
    const template = {
      type: templateTypes[fieldPref.key] || "string",
      value: undefined,
      label: i18n.t(`mainview.${fieldPref.key}`),
      width: fieldPref.width === -1 ? autoWidth : fieldPref.width,
      sortBy: ["tags", "folders"].includes(fieldPref.key)
        ? prefState.sidebarSortBy
        : undefined,
      sortOrder: ["tags", "folders"].includes(fieldPref.key)
        ? prefState.sidebarSortOrder
        : undefined,
      short:
        fieldPref.key === "authors" ? prefState.mainviewShortAuthor : undefined,
    };

    restWidth -= template.width;

    fieldTemplates.value.set(fieldPref.key, template);
  }
  restWidth = Math.max(restWidth, 0);
  for (const [k, v] of fieldTemplates.value.entries()) {
    v.width += restWidth;
    break;
  }
};

// ================================
// Event Handler
// ================================
const onItemClicked = async (selectedIndex: number[]) => {
  uiState.showingCandidatesId = "";

  if (isEqual(new Set(uiState.selectedIndex), new Set(selectedIndex))) {
    return;
  }

  uiState.selectedIndex = selectedIndex;
};

disposable(
  PLUIAPILocal.uiStateService.onChanged(
    "selectedIndex",
    async (newValue: { value: number[] }) => {
      const selectedIndex = newValue.value;
      if (
        selectedIndex.length === 1 &&
        prefState.mainviewType === "tableandpreview"
      ) {
        const target = paperEntities.value[selectedIndex[0]]
        if (!target.defaultSup) {
          displayingURL.value = "";
          return;
        }
        const fileURL = await PLAPI.fileService.access(
          target.supplementaries[target.defaultSup].url,
          true
        );
        if (
          uiState.commandBarSearchMode === "fulltext" &&
          uiState.commandBarText !== ""
        ) {
          displayingURL.value = `../viewer/viewer.html?file=${encodeURIComponent(
            fileURL
          )}&search=${uiState.commandBarText}`;
        } else {
          displayingURL.value = `../viewer/viewer.html?file=${encodeURIComponent(
            fileURL
          )}`;
        }
      } else {
        displayingURL.value = "";
      }
    }
  )
);

disposable(
  PLMainAPI.contextMenuService.on("dataContextMenuRelateClicked", () => {
    void relateSelectedPapers(uiState.selectedIndex);
  })
);

disposable(
  PLMainAPI.contextMenuService.on("dataContextMenuUnrelateClicked", () => {
    void unrelateSelectedPapers(uiState.selectedIndex);
  })
);

const getCategorizeList = (selectedList: number[]) => {
  let categorizeIdSet = new Set<string>();
  let categorizeList: CategorizerMenuItem[] = [];
  selectedList.forEach((index) => {
    const paper = paperEntities.value[index];
    paper.folders.forEach((folder) => {
      if (!categorizeIdSet.has(`${folder._id}`)) {
        categorizeIdSet.add(`${folder._id}`);
        categorizeList.push({
          type: CategorizerType.PaperFolder,
          name: folder.name,
          id: folder._id,
        } as CategorizerMenuItem);
      }
    });
    paper.tags.forEach((tag) => {
      if (!categorizeIdSet.has(`${tag._id}`)) {
        categorizeIdSet.add(`${tag._id}`);
        categorizeList.push({
          type: CategorizerType.PaperTag,
          name: tag.name,
          id: tag._id,
        } as CategorizerMenuItem);
      }
    });
  });

  return categorizeList;
};

const onItemRightClicked = (selectedIndex: number[]) => {
  onItemClicked(selectedIndex);
  const categorizeList = getCategorizeList(selectedIndex);
  PLMainAPI.contextMenuService.showPaperDataMenu(
    uiState.selectedIndex.length === 1,
    categorizeList,
    canRelateSelection(selectedIndex),
    canUnrelateSelection(selectedIndex)
  );
};

const onItemDoubleClicked = async (selectedIndex: number[]) => {
  onItemClicked(selectedIndex);

  const targetPaperEntity = paperEntities.value[selectedIndex[0]];
  if (targetPaperEntity.defaultSup) {
    const fileURL = await PLAPI.fileService.access(
      targetPaperEntity.supplementaries[targetPaperEntity.defaultSup].url,
      true
    );
    PLAPI.fileService.open(fileURL);
  }
};

const onItemDraged = async (selectedIndex: number[]) => {
  uiState.selectedIndex = selectedIndex;
  const draggingIds: string[] = [];
  for (const index of selectedIndex) {
    draggingIds.push(`${paperEntities.value[index]._id}`);
  }
  uiState.dragingIds = draggingIds;
};

const onItemFileDraged = async (selectedIndex: number[]) => {
  uiState.selectedIndex = selectedIndex;
  const fileURLs = await Promise.all(
    selectedIndex
      .map(async (index) => {
        if (paperEntities.value[index].defaultSup) {
          const url =
            paperEntities.value[index].supplementaries[
              paperEntities.value[index].defaultSup
            ].url;
          return eraseProtocol(await PLAPI.fileService.access(url, true));
        } else {
          return null;
        }
      })
      .filter((url) => url !== null) as Promise<string>[]
  );

  PLMainAPI.fileSystemService.startDrag(fileURLs);
};

const onCandidateButtonClicked = (id: string) => {
  uiState.showingCandidatesId = id;
};

const onTableHeaderClicked = (key: string) => {
  if (key === "tags" || key === "folders" || key == "codes") {
    return;
  }
  PLMainAPI.preferenceService.set({ mainviewSortBy: key });
  PLMainAPI.preferenceService.set({
    mainviewSortOrder: prefState.mainviewSortOrder === "asce" ? "desc" : "asce",
  });
};

const onTableHeaderWidthChanged = (changedWidths: Record<string, number>) => {
  const mainFieldPrefs = prefState.mainTableFields;
  for (const mainFieldPref of mainFieldPrefs) {
    if (changedWidths[mainFieldPref.key]) {
      mainFieldPref.width = changedWidths[mainFieldPref.key];
    }
  }
  PLMainAPI.preferenceService.set({ mainTableFields: mainFieldPrefs });
};

const onDropped = async (e: DragEvent) => {
  e.preventDefault();
  e.stopPropagation();

  const files = e.dataTransfer?.files;
  if (!files) {
    return;
  }

  const filePaths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    filePaths.push(`file://${files[i].path}`);
  }

  await PLAPI.paperService.create(filePaths);
};

const onFontSizeChanged = (fontSize: "normal" | "large" | "larger") => {
  if (prefState.mainviewType === "list") {
    itemSize.value = { normal: 64, large: 72, larger: 78 }[fontSize];
  } else {
    itemSize.value = { normal: 28, large: 32, larger: 34 }[fontSize];
  }
};

disposable(
  PLMainAPI.preferenceService.onChanged("fontsize", (newValue) => {
    onFontSizeChanged(newValue.value);
  })
);

disposable(
  PLMainAPI.preferenceService.onChanged(
    ["mainTableFields", "mainviewType", "mainviewShortAuthor"],
    () => {
      onFontSizeChanged(prefState.fontsize);
      if (prefState.mainviewType === "list") {
        computeFieldEnables();
      } else {
        computeFieldTemplates();
      }
    }
  )
);

onMounted(() => {
  onFontSizeChanged(prefState.fontsize);
  if (prefState.mainviewType === "list") {
    computeFieldEnables();
  } else {
    computeFieldTemplates();
  }
});
</script>

<template>
  <div
    id="data-view"
    class="px-2"
    @drop.prevent="onDropped"
    @dragenter="(e) => e.preventDefault()"
    @dragover="(e) => e.preventDefault()"
  >
    <ListView
      id="list-data-view"
      class="w-full max-h-[calc(100vh-4rem)]"
      v-if="prefState.mainviewType === 'list'"
      :entities="paperEntities"
      :candidates="uiState.metadataCandidates"
      :field-enables="fieldEnables"
      :selected-index="uiState.selectedIndex"
      :platform="uiState.os"
      :categorizer-sort-by="prefState.sidebarSortBy"
      :categorizer-sort-order="prefState.sidebarSortOrder"
      :item-size="itemSize"
      @event:click="onItemClicked"
      @event:contextmenu="onItemRightClicked"
      @event:dblclick="onItemDoubleClicked"
      @event:drag="onItemDraged"
      @event:drag-file="onItemFileDraged"
      @event:click-candidate-btn="onCandidateButtonClicked"
    />
    <PaperGraphView
      id="graph-data-view"
      class="w-full max-h-[calc(100vh-4rem)]"
      v-else-if="prefState.mainviewType === 'graph'"
      :entities="paperEntities"
      :selected-index="uiState.selectedIndex"
      :graph-palette="prefState.graphColorPalette"
      @event:click="onItemClicked"
      @event:dblclick="onItemDoubleClicked"
    />
    <TableView
      id="table-data-view"
      class="w-full max-h-[calc(100vh-4rem)]"
      v-else-if="prefState.mainviewType === 'table'"
      :entities="paperEntities"
      :candidates="uiState.metadataCandidates"
      :field-templates="fieldTemplates"
      :selected-index="uiState.selectedIndex"
      :platform="uiState.os"
      :entity-sort-by="prefState.mainviewSortBy"
      :entity-sort-order="prefState.mainviewSortOrder"
      :item-size="itemSize"
      @event:click="onItemClicked"
      @event:contextmenu="onItemRightClicked"
      @event:dblclick="onItemDoubleClicked"
      @event:drag="onItemDraged"
      @event:drag-file="onItemFileDraged"
      @event:header-click="onTableHeaderClicked"
      @event:header-width-change="onTableHeaderWidthChanged"
      @event:click-candidate-btn="onCandidateButtonClicked"
    />
    <TablePreviewView
      id="table-preview-data-view"
      class="w-full max-h-[calc(100vh-4rem)]"
      v-else-if="prefState.mainviewType === 'tableandpreview'"
      :entities="paperEntities"
      :candidates="uiState.metadataCandidates"
      :field-templates="fieldTemplates"
      :selected-index="uiState.selectedIndex"
      :displayingURL="displayingURL"
      :platform="uiState.os"
      :entity-sort-by="prefState.mainviewSortBy"
      :entity-sort-order="prefState.mainviewSortOrder"
      :item-size="itemSize"
      @event:click="onItemClicked"
      @event:contextmenu="onItemRightClicked"
      @event:dblclick="onItemDoubleClicked"
      @event:drag="onItemDraged"
      @event:drag-file="onItemFileDraged"
      @event:header-click="onTableHeaderClicked"
      @event:header-width-change="onTableHeaderWidthChanged"
      @event:click-candidate-btn="onCandidateButtonClicked"
    />
  </div>
</template>
