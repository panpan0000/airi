<script setup lang="ts">
import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileHeader from '@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useOpenWebUIBridge } from '@proj-airi/stage-ui/composables/openwebui-bridge'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'

const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')
const { stageModelRenderer } = storeToRefs(useSettings())

const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
onMounted(() => syncBackgroundTheme())

const { x: mouseX, y: mouseY } = useMouse()
const cursorPosition = computed(() => ({
  x: mouseX.value,
  y: mouseY.value,
}))

const openWebUIBridge = useOpenWebUIBridge({})
const owebIframeRef = useTemplateRef<HTMLIFrameElement>('owebIframe')
watch(owebIframeRef, el => openWebUIBridge.registerIframe(el ?? null), { immediate: true })
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    class="widgets top-widgets"
    :background="selectedOption"
    :top-color="sampledColor"
  >
    <div relative flex="~ col" z-2 h-100dvh w-100vw of-hidden>
      <!-- header -->
      <div class="px-0 py-1 md:px-3 md:py-3" w-full gap-2>
        <Header class="hidden md:flex" />
        <MobileHeader class="flex md:hidden" />
      </div>
      <!-- page: left half AIRI, right half OWEB -->
      <div class="min-h-0 flex flex-1 gap-0 of-hidden">
        <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col" class="flex-1">
          <div relative flex-1 min-w="1/2">
            <div
              absolute left-0 z-15 px-3
              :class="[
                stageModelRenderer === 'live2d' ? 'top-0 h-full py-[20vh]' : 'top-1/2 -translate-y-1/2',
              ]"
            >
              <ViewControlSlider />
            </div>
            <WidgetStage
              h-full w-full
              :cursor-position="cursorPosition"
              :enable-orbit-controls="!isMobile"
              :paused="paused"
            />
          </div>
          <InteractiveArea v-if="!isMobile" h="85dvh" absolute right-4 flex flex-1 flex-col max-w="500px" min-w="30%" />
          <MobileInteractiveArea v-if="isMobile" @settings-open="handleSettingsOpen" />
        </div>
        <!-- Right: OWEB iframe -->
        <div class="flex-1 of-hidden" style="min-width: 40vw;">
          <iframe ref="owebIframe" :src="openWebUIBridge.baseUrl" class="h-full w-full border-none" />
        </div>
      </div>
      <HoloCoupon />
    </div>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: IndexScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>
