package org.omicron.mobile.feature.reader

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostTag

@RunWith(AndroidJUnit4::class)
class CompactPostCardTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private lateinit var banner: File
    private val events = mutableListOf<String>()

    @Before
    fun createBanner() {
        banner = File(rule.activity.cacheDir, "compact-card-banner.png")
        val bitmap = Bitmap.createBitmap(16, 16, Bitmap.Config.ARGB_8888)
        banner.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }

    @After
    fun removeBanner() {
        banner.delete()
    }

    @Test
    fun bannerlessCardKeepsActionsOnOneLineAndNavigationWorks() {
        showCard(post())

        assertCompactFooter()
        rule.onNodeWithText("Jan 1, 2026", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithText("Alice", substring = true).performClick()
        rule.onNodeWithText("A compact article").performClick()
        rule.onNodeWithText("#design").performClick()
        rule.onNodeWithContentDescription("Like").performClick()
        rule.onNodeWithContentDescription("Open responses").performClick()
        rule.onNodeWithContentDescription("Recommend").performClick()
        rule.onNodeWithContentDescription("Save for later").performClick()

        assertEquals(listOf("profile", "open", "tag:design", "like", "open", "recommend", "save"), events)
    }

    @Test
    fun bannerCardKeepsCompactFooterAndLeavesRoomForText() {
        showCard(post(bannerUrl = banner.toURI().toString()), dark = false)

        assertCompactFooter()
        val excerpt = rule.onNodeWithText(SUMMARY, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue(excerpt.width >= rule.density.run { 190.dp.toPx() })
        assertTrue(excerpt.width < rule.density.run { 260.dp.toPx() })
        rule.onNodeWithText("A compact article").performClick()
        assertEquals(listOf("open"), events)
    }

    @Test
    fun failedBannerRestoresFullWidthTextAndReplacementBannerCanLoad() {
        val current = mutableStateOf(post(bannerUrl = File(rule.activity.cacheDir, "missing-banner.png").toURI().toString()))
        rule.setContent {
            OmicronTheme {
                Box(Modifier.width(360.dp)) { card(current.value) }
            }
        }

        rule.waitUntil(10_000) { excerptWidth() > rule.density.run { 300.dp.toPx() } }
        rule.runOnIdle { current.value = current.value.copy(bannerUrl = banner.toURI().toString()) }
        rule.waitUntil(10_000) { excerptWidth() < rule.density.run { 260.dp.toPx() } }
        assertCompactFooter()
    }

    @Test
    fun narrowCardWithLargeFontsAndCountsKeepsTouchTargetsInsideTheCard() {
        showCard(
            post(bannerUrl = banner.toURI().toString()).copy(
                title = "A longer article title that remains readable on a narrow phone",
                author = PostAuthor("author", "alice@a-long-instance.example", "Alice with a long display name", null, true),
                likeCount = 123456,
                commentCount = 123456,
                recommendCount = 123456,
            ),
            width = 320,
            fontScale = 1.5f,
        )

        val bounds = listOf("Like", "Open responses", "Recommend", "Save for later").map { label ->
            rule.onNodeWithContentDescription(label).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        }
        val minimum = rule.density.run { 48.dp.toPx() }
        bounds.forEach {
            assertTrue(it.width >= minimum && it.height >= minimum)
            assertTrue(it.left >= 0 && it.right <= rule.density.run { 320.dp.toPx() })
        }
        bounds.zipWithNext().forEach { (first, second) ->
            assertTrue(first.right <= second.left || first.bottom <= second.top)
        }
        rule.onNodeWithContentDescription("Save for later").performClick()
        assertEquals(listOf("save"), events)
    }

    @Test
    fun guestActionsRequestSignInAndBusySelectedActionsStayDisabled() {
        val state = mutableStateOf(TimelineUiState(signedIn = false))
        val item = post().copy(liked = true, recommended = true)
        rule.setContent {
            OmicronTheme {
                Box(Modifier.width(360.dp)) { card(item, state.value) }
            }
        }
        rule.onNodeWithContentDescription("Like").performClick()
        rule.onNodeWithContentDescription("Recommend").performClick()
        rule.onNodeWithContentDescription("Save for later").performClick()
        assertEquals(listOf("sign-in", "sign-in", "sign-in"), events)

        rule.runOnIdle {
            state.value = TimelineUiState(signedIn = true, savedPostIds = setOf(item.id), likeBusyPostIds = setOf(item.id))
        }
        rule.onNodeWithContentDescription("Like").assertIsSelected().assertIsNotEnabled()
        rule.onNodeWithContentDescription("Recommend").assertIsSelected().assertIsNotEnabled()
        rule.onNodeWithContentDescription("Saved for later").assertIsSelected().assertIsNotEnabled()
        rule.onNodeWithContentDescription("Open responses").performClick()
        assertEquals("open", events.last())
    }

    private fun showCard(post: Post, dark: Boolean = true, width: Int = 360, fontScale: Float = 1f) {
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(darkTheme = dark) {
                    Box(Modifier.width(width.dp)) { card(post) }
                }
            }
        }
        rule.waitForIdle()
    }

    @Composable
    private fun card(post: Post, state: TimelineUiState = TimelineUiState(signedIn = true)) {
        PostCard(
            post = post,
            state = state,
            onOpen = { events += "open" },
            onOpenProfile = { events += "profile" },
            onOpenTag = { events += "tag:$it" },
            onSignIn = { events += "sign-in" },
            onToggleLike = { events += "like" },
            onToggleRecommendation = { events += "recommend" },
            onToggleReadLater = { events += "save" },
        )
    }

    private fun assertCompactFooter() {
        val actions = listOf("Like", "Open responses", "Recommend", "Save for later").map {
            rule.onNodeWithContentDescription(it).assertIsDisplayed().fetchSemanticsNode().boundsInRoot
        }
        actions.forEach {
            assertEquals(actions.first().center.y, it.center.y, 1f)
            assertTrue(it.width >= rule.density.run { 48.dp.toPx() })
            assertTrue(it.height >= rule.density.run { 48.dp.toPx() })
        }
        val author = rule.onNodeWithText("Alice", substring = true).fetchSemanticsNode().boundsInRoot
        val height = actions.last().bottom - author.top
        assertTrue("Card content exceeds 260dp: ${height / rule.density.density}dp", height <= rule.density.run { 260.dp.toPx() })
    }

    private fun excerptWidth() = rule.onNodeWithText(SUMMARY, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot.width

    private fun post(bannerUrl: String? = null) = Post(
        id = "post",
        title = "A compact article",
        summary = SUMMARY,
        bannerUrl = bannerUrl,
        createdAt = "2026-01-01T00:00:00Z",
        author = PostAuthor("author", "alice", "Alice", null, false),
        tags = listOf(PostTag("design", "design")),
        likeCount = 1,
        commentCount = 1,
        recommendCount = 0,
        remote = false,
    )

    private companion object {
        const val SUMMARY = "A readable preview with enough text to fill two lines, with or without a banner image."
    }
}
