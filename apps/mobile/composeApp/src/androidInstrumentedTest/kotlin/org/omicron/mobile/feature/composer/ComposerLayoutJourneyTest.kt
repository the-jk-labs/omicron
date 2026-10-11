package org.omicron.mobile.feature.composer

import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.domain.model.ComposerBlock
import org.omicron.mobile.domain.model.OwnPostStatus

@RunWith(AndroidJUnit4::class)
class ComposerLayoutJourneyTest {
    @get:Rule val rule = createAndroidComposeRule<ComponentActivity>()

    private val state = mutableStateOf(ComposerUiState(loadPhase = ComposerLoadPhase.Content))
    private val events = mutableListOf<String>()
    private val darkTheme = mutableStateOf(true)

    @Test
    fun lightAndDarkWritingSurfacesKeepTheDocumentInFocus() {
        state.value =
            state.value.copy(
                title = "A small idea worth sharing",
                blocks =
                    listOf(
                        ComposerBlock.Paragraph(
                            "opening",
                            "Start with a clear thought. Give it room to grow into a story.",
                        ),
                    ),
            )
        show()
        rule.onNodeWithText("A small idea worth sharing").assertIsDisplayed()
        rule.onNodeWithContentDescription("Write…").assertIsDisplayed()
        rule.onNodeWithContentDescription("Summary (optional)").assertDoesNotExist()
        capture("composer-dark.png")
        rule.runOnIdle { darkTheme.value = false }
        rule.onNodeWithContentDescription("Write…").assertIsDisplayed()
        rule.onNodeWithText("Publish").assertIsDisplayed()
        capture("composer-light.png")
    }

    @Test
    fun optionalDetailsAreCollapsedAndRetainEditedMetadata() {
        show(dark = false)
        rule.onNodeWithContentDescription("Summary (optional)").assertDoesNotExist()
        rule
            .onNodeWithContentDescription("Post details")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Collapsed"))
            .performClick()
        rule
            .onNode(
                hasSetTextAction() and
                    SemanticsMatcher.expectValue(
                        SemanticsProperties.ContentDescription,
                        listOf("Summary (optional)"),
                    ),
            )
            .performScrollTo()
            .performTextInput("A concise preview")
        rule
            .onNodeWithContentDescription("Tags (optional)")
            .performScrollTo()
            .performTextInput("technology kotlin")
        rule
            .onNodeWithContentDescription("Language (optional)")
            .performScrollTo()
            .performTextInput("en")
        rule.onNodeWithContentDescription("Post details").performScrollTo().performClick()
        rule.onNodeWithContentDescription("Summary (optional)").assertDoesNotExist()
        rule.onNodeWithContentDescription("Post details").performClick()
        rule.onNodeWithText("A concise preview").performScrollTo().assertIsDisplayed()
        assertEquals("technology kotlin", state.value.tags)
        assertEquals("en", state.value.language)
    }

    @Test
    fun iconAndLabelToolbarOffersEverySupportedInsertion() {
        show()
        listOf("Paragraph", "Heading", "Quote", "Code", "Bulleted list", "Numbered list", "Divider")
            .forEach { label ->
                rule.onNodeWithContentDescription(label).performScrollTo().performClick()
            }
        rule.onNodeWithContentDescription("Add image").performScrollTo().performClick()
        assertEquals(ComposerBlockType.entries.map { "add:$it" } + "image", events)
    }

    @Test
    fun insertingAtTheEndOfALongPostScrollsAndFocusesTheNewBlock() {
        state.value =
            state.value.copy(
                blocks = (0..12).map { ComposerBlock.Paragraph("paragraph-$it", "Paragraph $it") },
            )
        show(insertHeading = true)
        rule.onNodeWithContentDescription("Heading").performScrollTo().performClick()
        rule
            .onNode(
                hasSetTextAction() and
                    SemanticsMatcher.expectValue(
                        SemanticsProperties.ContentDescription,
                        listOf("Heading"),
                    ),
            )
            .assertIsDisplayed()
            .assertIsFocused()
            .performTextInput("A new section")
        rule.onNodeWithText("Save draft").assertIsDisplayed().performClick()
        rule.onNodeWithText("Publish").assertIsDisplayed()
        assertEquals("A new section", (state.value.blocks.last() as ComposerBlock.Heading).text)
        assertEquals(listOf("add:Heading", "save"), events)
        capture("composer-keyboard.png")
    }

    @Test
    fun blockMenuRemovesContentAndKeepsAnEmptyEditorUsable() {
        show()
        rule.onNodeWithContentDescription("Paragraph block options").performClick()
        rule.onNodeWithText("Remove block").performClick()
        rule.onNodeWithText("Start with a paragraph or add a block below.").assertIsDisplayed()
        rule.onNodeWithContentDescription("Paragraph").assertIsDisplayed().performClick()
        assertEquals(listOf("remove:new-0", "add:Paragraph"), events)
    }

    @Test
    fun narrowLargeTextKeepsPublishingActionsAndFullWidthBodyUsable() {
        show(width = 320, fontScale = 1.5f, dark = false)
        listOf(
                rule.onNodeWithText("Save draft"),
                rule.onNodeWithText("Publish"),
                rule.onNodeWithContentDescription("Publishing options"),
                rule.onNodeWithContentDescription("Post details"),
            )
            .forEach { target ->
                target.assertIsDisplayed()
                val bounds = target.fetchSemanticsNode().boundsInRoot
                assertTrue(bounds.width >= rule.density.run { 48.dp.toPx() })
                assertTrue(bounds.height >= rule.density.run { 48.dp.toPx() })
                assertTrue(bounds.left >= 0 && bounds.right <= rule.density.run { 320.dp.toPx() })
            }
        val body = rule.onNodeWithContentDescription("Write…").performScrollTo()
        assertTrue(
            body.fetchSemanticsNode().boundsInRoot.width >= rule.density.run { 288.dp.toPx() },
        )
        val publishingOptions = rule.onNodeWithContentDescription("Publishing options").fetchSemanticsNode().boundsInRoot
        assertTrue(
            "Publishing actions should align to the right edge: $publishingOptions",
            publishingOptions.right >= rule.density.run { 288.dp.toPx() },
        )
        capture("composer-actions-right.png")
        rule.onNodeWithContentDescription("Publishing options").performClick()
        rule.onNodeWithText("Schedule…").performClick()
        assertEquals(listOf("schedule"), events)
    }

    @Test
    fun uploadsAndSavesDisableConflictingPublishingActions() {
        state.value = state.value.copy(imageUpload = ImageUploadState.Uploading)
        show()
        rule.onNodeWithText("Save draft").assertIsNotEnabled()
        rule.onNodeWithText("Publish").assertIsNotEnabled()
        rule.onNodeWithContentDescription("Publishing options").assertIsNotEnabled()
        rule.onNodeWithContentDescription("Add image").performScrollTo().assertIsNotEnabled()
        rule.runOnIdle {
            state.value =
                state.value.copy(imageUpload = ImageUploadState.Idle, save = ComposerSave.Saving)
        }
        rule.onNodeWithText("Publish").assertIsNotEnabled()
        rule.onNodeWithContentDescription("Publishing options").assertIsNotEnabled()
    }

    @Test
    fun scheduledAndPublishedPostsExposeTheRightActions() {
        state.value =
            state.value.copy(
                postId = "existing",
                sourceStatus = OwnPostStatus.Scheduled,
                scheduledFor = "2027-01-01T09:00:00Z",
            )
        show()
        rule.onNodeWithText("Scheduled for", substring = true).assertIsDisplayed()
        rule.onNodeWithText("Publish now").assertIsDisplayed()
        rule.onNodeWithContentDescription("Publishing options").performClick()
        rule.onNodeWithText("Reschedule…").performClick()
        rule.runOnIdle {
            state.value =
                state.value.copy(sourceStatus = OwnPostStatus.Published, scheduledFor = null)
        }
        rule.onNodeWithText("Save changes").assertIsDisplayed().performClick()
        rule.onNodeWithContentDescription("Publishing options").assertDoesNotExist()
        rule.onNodeWithText("Publish").assertDoesNotExist()
        assertEquals(listOf("schedule", "save"), events)
    }

    @Test
    fun offlineAndExpiredSessionRecoveryStaysReachable() {
        state.value = state.value.copy(save = ComposerSave.Error(ComposerError.Offline))
        show()
        rule.onNodeWithText("Try again").assertIsDisplayed().performClick()
        rule.runOnIdle {
            state.value = state.value.copy(save = ComposerSave.Error(ComposerError.Unauthorized))
        }
        rule.onNodeWithText("Sign in").assertIsDisplayed().performClick()
        assertEquals(listOf("retry-save", "sign-in"), events)
    }

    @Suppress("DEPRECATION")
    private fun show(
        width: Int = 360,
        fontScale: Float = 1f,
        dark: Boolean = true,
        insertHeading: Boolean = false,
    ) {
        darkTheme.value = dark
        rule.activityRule.scenario.onActivity {
            it.enableEdgeToEdge()
            it.window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        }
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(
                    darkTheme = darkTheme.value,
                    onDarkThemeChanged = { isDark ->
                        WindowCompat.getInsetsController(
                                rule.activity.window,
                                rule.activity.window.decorView,
                            )
                            .apply {
                                isAppearanceLightStatusBars = !isDark
                                isAppearanceLightNavigationBars = !isDark
                            }
                    },
                ) {
                    Box(Modifier.width(width.dp)) {
                        ComposerScreen(
                            state = state.value,
                            onBack = { events += "back" },
                            onSignIn = { events += "sign-in" },
                            onPublished = { events += "published:$it" },
                            onTitleChange = { state.value = state.value.copy(title = it) },
                            onSummaryChange = { state.value = state.value.copy(summary = it) },
                            onTagsChange = { state.value = state.value.copy(tags = it) },
                            onLanguageChange = { state.value = state.value.copy(language = it) },
                            onBlockTextChange = { id, text ->
                                state.value =
                                    state.value.copy(
                                        blocks =
                                            state.value.blocks.map {
                                                if (it.id == id && it is ComposerBlock.Heading)
                                                    it.copy(text = text)
                                                else it
                                            },
                                    )
                            },
                            onListItemChange = { _, _, _ -> },
                            onAddListItem = {},
                            onRemoveListItem = { _, _ -> },
                            onAddBlock = {
                                events += "add:$it"
                                if (insertHeading)
                                    state.value =
                                        state.value.copy(
                                            blocks =
                                                state.value.blocks +
                                                    ComposerBlock.Heading("inserted", level = 2),
                                        )
                            },
                            onRemoveBlock = { id ->
                                events += "remove:$id"
                                state.value =
                                    state.value.copy(
                                        blocks = state.value.blocks.filterNot { it.id == id },
                                    )
                            },
                            onPickImage = { events += "image" },
                            onPickCover = { events += "cover" },
                            onRemoveCover = {},
                            onImageAltChange = { _, _ -> },
                            onRetryImageUpload = {},
                            onRetryCoverUpload = {},
                            onSaveDraft = { events += "save" },
                            onPublish = { events += "publish" },
                            onOpenSchedule = { events += "schedule" },
                            onDismissSchedule = {},
                            onSchedulePost = {},
                            onUnschedule = {},
                            onRetryLoad = {},
                            onRetrySave = { events += "retry-save" },
                        )
                    }
                }
            }
        }
    }

    private fun capture(name: String) {
        rule.waitForIdle()
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        rule.activity.cacheDir.resolve(name).outputStream().use {
            bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it)
        }
        bitmap.recycle()
    }
}
