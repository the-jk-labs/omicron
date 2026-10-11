package org.omicron.mobile.feature.profile

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.domain.model.Post
import org.omicron.mobile.domain.model.PostAuthor
import org.omicron.mobile.domain.model.PostTag
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.ProfileLink
import org.omicron.mobile.domain.model.ProfileUser
import org.omicron.mobile.domain.model.RelationActor

@RunWith(AndroidJUnit4::class)
class ProfileLayoutJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val state = mutableStateOf(content())
    private val events = mutableListOf<String>()

    @Test
    fun ownerCanManagePostsBrowseRecommendationsAndOpenMembers() {
        state.value = content().copy(currentUserId = "ada")
        show()

        rule.onNodeWithText("Manage posts").performClick()
        rule.onNodeWithText("A thoughtful article").performScrollTo().performClick()
        tab("Recommendations").performScrollTo().performClick().assertIsSelected()
        rule.onNodeWithText("Recommended reading").performScrollTo().performClick()
        count("Followers").performScrollTo().performClick()
        tab("Followers").assertIsSelected()
        rule.onNodeWithText("Grace Hopper").performScrollTo().performClick()

        assertEquals(listOf("manage", "post:article", "post:recommended", "profile:grace"), events)
    }

    @Test
    fun relationshipMenuUpdatesLabelsAndShowsMutationFailure() {
        show()
        rule.onNodeWithText("Follow", substring = false).performClick()
        rule.onNodeWithContentDescription("Following").assertIsDisplayed()
        rule.onNodeWithContentDescription("More actions").performClick()
        rule.onNodeWithText("Mute").performClick()
        rule.onNodeWithContentDescription("More actions").performClick()
        rule.onNodeWithText("Unmute").assertIsDisplayed()
        rule.onNodeWithText("Block").performClick()
        rule.onNodeWithText("Could not update block. Try again.").assertIsDisplayed()
        assertEquals(listOf("follow", "mute", "block"), events)
    }

    @Test
    fun guestPrivateProfileKeepsCountsReadOnlyAndOffersSignIn() {
        state.value = content().copy(signedIn = false, profile = profile().copy(locked = true, user = profile().user.copy(isPrivate = true)))
        show(dark = false)

        rule.onNodeWithText("Sign in to follow").performClick()
        rule.onNodeWithText("This account is private").performScrollTo().assertIsDisplayed()
        assertTrue(rule.onAllNodesWithText("Recommendations").fetchSemanticsNodes().isEmpty())
        assertTrue(rule.onAllNodesWithText("Followers").fetchSemanticsNodes().none { it.config.contains(SemanticsActions.OnClick) })
        assertTrue(rule.onAllNodesWithText("More actions").fetchSemanticsNodes().isEmpty())
        assertEquals(listOf("sign-in"), events)
    }

    @Test
    fun remoteProfileShowsHostWithoutDuplicatingItAndOpensOriginal() {
        state.value = content().copy(profile = profile().copy(remote = true, user = profile().user.copy(username = "ada@writers.example", host = "writers.example", profileUrl = "https://writers.example/@ada")))
        show()
        rule.onNodeWithText("@ada", useUnmergedTree = true).assertIsDisplayed()
        rule.onNodeWithText("writers.example", useUnmergedTree = true).assertIsDisplayed()
        assertTrue(rule.onAllNodesWithText("@ada@writers.example").fetchSemanticsNodes().isEmpty())
        assertTrue(rule.onAllNodesWithText("Followers").fetchSemanticsNodes().none { it.config.contains(SemanticsActions.OnClick) })
        tab("About").performScrollTo().performClick()
        rule.onNodeWithText("View original profile").performScrollTo().performClick()
        assertEquals(listOf("link:https://writers.example/@ada"), events)
    }

    @Test
    fun aboutLinksAreUsableAndLinkFailureIsVisible() {
        show(dark = false, failLink = true)
        tab("About").performScrollTo().performClick().assertIsSelected()
        rule.onNodeWithText("Website").performScrollTo().performClick()
        rule.onNodeWithText("Could not open this link. Try again.").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Joined Jan 1, 2026", useUnmergedTree = true).performScrollTo().assertIsDisplayed()
        assertEquals(listOf("link:https://ada.example/about"), events)
    }

    @Test
    fun narrowLargeTextProfileKeepsActionsAndCountsInsideTheViewport() {
        state.value = content().copy(
            profile = profile().copy(
                followerCount = 123456789,
                followingCount = 123456789,
                user = profile().user.copy(displayName = "Ada Lovelace with a long display name", tags = listOf(PostTag("design", "design"), PostTag("writing", "writing"), PostTag("accessibility", "accessibility"))),
            ),
        )
        show(width = 320, fontScale = 1.5f)
        val name = rule.onNodeWithText("Ada Lovelace with a long display name", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertTrue(name.width >= rule.density.run { 280.dp.toPx() })
        val targets = listOf(
            rule.onNodeWithText("Follow", substring = false),
            rule.onNodeWithContentDescription("More actions"),
            count("Followers"),
            count("Following"),
        )
        targets.forEachIndexed { index, target ->
            target.performScrollTo().assertIsDisplayed()
            val bounds = target.fetchSemanticsNode().boundsInRoot
            assertTrue("Target $index is too narrow: $bounds", bounds.width >= rule.density.run { 48.dp.toPx() })
            assertTrue("Target $index is too short: $bounds", bounds.height >= rule.density.run { 48.dp.toPx() })
            assertTrue(bounds.left >= 0 && bounds.right <= rule.density.run { 320.dp.toPx() })
        }
        tab("About").performScrollTo().performClick().assertIsSelected()
        rule.onNodeWithText("Website").performScrollTo().performClick()
        assertEquals(listOf("link:https://ada.example/about"), events)
    }

    @Test
    fun busyActionsAreDisabledAndContentErrorsCanBeRetried() {
        state.value = content().copy(followBusy = true, articles = ProfilePostList(error = ProfileContentError.Load))
        show()
        rule.onNodeWithText("Follow", substring = false).assertIsNotEnabled()
        rule.onNodeWithContentDescription("More actions").assertIsNotEnabled()
        rule.onNodeWithText("Try again").performScrollTo().performClick()
        assertEquals(listOf("retry"), events)
    }

    @Test
    fun failedArticleBannerFallsBackWithoutBreakingPostNavigation() {
        val missing = File(rule.activity.cacheDir, "missing-profile-banner.png").toURI().toString()
        state.value = content().copy(articles = ProfilePostList(posts = listOf(post("article", "A thoughtful article").copy(bannerUrl = missing))))
        show()
        rule.onNodeWithText("A thoughtful article").performScrollTo()
        rule.waitUntil(10_000) {
            rule.onNodeWithText(SUMMARY, useUnmergedTree = true).fetchSemanticsNode().boundsInRoot.width > rule.density.run { 300.dp.toPx() }
        }
        rule.onNodeWithText("A thoughtful article").performClick()
        assertEquals(listOf("post:article"), events)
    }

    private fun tab(label: String) = rule.onNode(hasText(label) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Tab))

    private fun count(label: String) = rule.onNode(hasClickAction() and hasText(label) and SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))

    private fun show(width: Int = 360, fontScale: Float = 1f, dark: Boolean = true, failLink: Boolean = false) {
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(darkTheme = dark) {
                    Box(Modifier.width(width.dp)) {
                        ProfileScreen(
                            state = state.value,
                            onBack = { events += "back" },
                            onRetry = { events += "retry" },
                            onSelectTab = { state.value = state.value.copy(selectedTab = it) },
                            onLoadMore = { events += "load-more" },
                            onSignIn = { events += "sign-in" },
                            onOpenPost = { events += "post:$it" },
                            onOpenProfile = { events += "profile:$it" },
                            onOpenManage = { events += "manage" },
                            onAccountAction = { events += "account:$it" },
                            onToggleFollow = {
                                events += "follow"
                                state.value = state.value.copy(profile = state.value.profile!!.copy(followState = ProfileFollowState.Following))
                            },
                            onToggleMute = {
                                events += "mute"
                                state.value = state.value.copy(profile = state.value.profile!!.copy(isMuted = true))
                            },
                            onToggleBlock = {
                                events += "block"
                                state.value = state.value.copy(relationError = ProfileRelationError.Block)
                            },
                            onOpenLink = {
                                events += "link:$it"
                                if (failLink) error("No URI handler")
                            },
                        )
                    }
                }
            }
        }
    }

    private companion object {
        const val SUMMARY = "A readable preview with enough text to fill two lines on a phone."

        fun profile() = Profile(
            user = ProfileUser("ada", "ada", "Ada Lovelace", "Writing about thoughtful software.", null, "2026-01-01T00:00:00Z", false, emptyList(), listOf(ProfileLink("Website", "https://ada.example/about")), null, null),
            followerCount = 16,
            followingCount = 24,
            followState = ProfileFollowState.None,
            isFollowing = false,
            isMuted = false,
            isBlocked = false,
            locked = false,
            remote = false,
        )

        fun post(id: String, title: String) = Post(
            id = id,
            title = title,
            summary = SUMMARY,
            bannerUrl = null,
            createdAt = "2026-01-01T00:00:00Z",
            author = PostAuthor("ada", "ada", "Ada Lovelace", null, false),
            tags = emptyList(),
            likeCount = 2,
            commentCount = 3,
            recommendCount = 1,
            remote = false,
        )

        fun content() = ProfileUiState(
            phase = ProfilePhase.Content,
            profile = profile(),
            signedIn = true,
            articles = ProfilePostList(posts = listOf(post("article", "A thoughtful article"))),
            recommendations = ProfilePostList(posts = listOf(post("recommended", "Recommended reading"))),
            members = listOf(RelationActor("grace", "grace", "Grace Hopper", null, false)),
        )
    }
}
