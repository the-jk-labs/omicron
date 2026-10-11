package org.omicron.mobile.feature.profile

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.domain.model.Profile
import org.omicron.mobile.domain.model.ProfileFollowState
import org.omicron.mobile.domain.model.ProfileUser
import org.omicron.mobile.domain.model.RelationActor

@RunWith(AndroidJUnit4::class)
class ProfileConnectionsJourneyTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private val state = mutableStateOf(content())
    private val events = mutableListOf<String>()

    @Test
    fun initialFollowingTabSwitchesListsAndOpensLocalAndRemoteProfiles() {
        state.value = content().copy(selectedTab = ProfileConnectionsTab.Following)
        show()

        rule.onNodeWithText("ada").assertIsDisplayed()
        rule.onNodeWithText("24 following").assertIsSelected()
        rule.onNodeWithText("@alan@writers.example").assertIsDisplayed().performClick()
        rule.onNodeWithText("16 followers").performClick().assertIsSelected()
        rule.onNodeWithText("@grace").assertIsDisplayed().performClick()
        rule.onNodeWithContentDescription("Back to profile").performClick()

        assertEquals(listOf("profile:alan@writers.example", "profile:grace", "back"), events)
    }

    @Test
    fun emptyListsHaveTheirOwnMessagesInLightAppearance() {
        state.value = content().copy(followers = ProfileMemberList(loaded = true), following = ProfileMemberList(loaded = true))
        show(dark = false)

        rule.onNodeWithText("No followers yet.").assertIsDisplayed()
        rule.onNodeWithText("24 following").performClick()
        rule.onNodeWithText("Not following anyone yet.").assertIsDisplayed()
    }

    @Test
    fun loadingAndOfflineFailureKeepBackNavigationAndRetryReachable() {
        state.value = content().copy(followers = ProfileMemberList(loading = true))
        show()
        rule.onNodeWithContentDescription("Loading people").assertIsDisplayed()
        rule.onNodeWithContentDescription("Back to profile").assertIsDisplayed()

        rule.runOnIdle { state.value = state.value.copy(followers = ProfileMemberList(error = ProfileLoadError.Offline)) }
        rule.onNodeWithText("You appear to be offline. Check your connection and try again.").assertIsDisplayed()
        rule.onNodeWithText("Try again").performClick()
        assertEquals(listOf("retry"), events)

        rule.runOnIdle { state.value = content() }
        rule.onNodeWithText("@grace").assertIsDisplayed()
    }

    @Test
    fun profileLoadFailureAndMissingProfileKeepBackNavigation() {
        state.value = ProfileConnectionsUiState("ada", phase = ProfilePhase.Error(ProfileLoadError.Server))
        show(dark = false)
        rule.onNodeWithText("Could not load these people. Try again.").assertIsDisplayed()
        rule.onNodeWithText("Try again").performClick()

        rule.runOnIdle { state.value = state.value.copy(phase = ProfilePhase.NotFound) }
        rule.onNodeWithText("Profile not found.").assertIsDisplayed()
        rule.onNodeWithContentDescription("Back to profile").performClick()
        assertEquals(listOf("retry", "back"), events)
    }

    @Test
    fun privateProfilesHideMembersAndExpiredSessionsOfferSignIn() {
        state.value = content().copy(profile = profile().copy(locked = true), sessionExpired = true)
        show()
        rule.onNodeWithText("This account is private").assertIsDisplayed()
        rule.onNodeWithText("Follow this writer to see their followers and following.").assertIsDisplayed()
        rule.onNodeWithText("@grace").assertDoesNotExist()
        rule.onNodeWithText("Sign in").performClick()
        assertEquals(listOf("sign-in"), events)
    }

    @Test
    fun narrowLargeTextKeepsTabsAndMemberTargetsWithinTheViewport() {
        state.value = content().copy(profile = profile().copy(followerCount = 123456789, followingCount = 123456789))
        show(width = 320, fontScale = 1.5f)

        rule.onNodeWithContentDescription("Back to profile").assertHeightIsAtLeast(48.dp)
        rule.onNodeWithText("123456789 following").performScrollTo().performClick().assertIsSelected().assertHeightIsAtLeast(48.dp)
        val member = rule.onNodeWithText("@alan@writers.example")
        member.assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        val bounds = member.fetchSemanticsNode().boundsInRoot
        assertTrue(bounds.left >= 0 && bounds.right <= rule.density.run { 320.dp.toPx() })
        member.performClick()
        assertEquals(listOf("profile:alan@writers.example"), events)
    }

    private fun show(width: Int = 360, fontScale: Float = 1f, dark: Boolean = true) {
        rule.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                OmicronTheme(darkTheme = dark) {
                    Box(Modifier.width(width.dp)) {
                        ProfileConnectionsScreen(
                            state = state.value,
                            onBack = { events += "back" },
                            onSelectTab = { state.value = state.value.copy(selectedTab = it) },
                            onRetry = { events += "retry" },
                            onSignIn = { events += "sign-in" },
                            onOpenProfile = { events += "profile:$it" },
                        )
                    }
                }
            }
        }
    }

    private companion object {
        fun profile() = Profile(
            user = ProfileUser("ada", "ada", "Ada Lovelace", "", null, "", false, emptyList(), emptyList(), null, null),
            followerCount = 16,
            followingCount = 24,
            followState = ProfileFollowState.None,
            isFollowing = false,
            isMuted = false,
            isBlocked = false,
            locked = false,
            remote = false,
        )

        fun content() = ProfileConnectionsUiState(
            username = "ada",
            phase = ProfilePhase.Content,
            profile = profile(),
            followers = ProfileMemberList(items = listOf(RelationActor("grace", "grace", "Grace Hopper", null, false)), loaded = true),
            following = ProfileMemberList(items = listOf(RelationActor("alan", "alan@writers.example", "Alan Turing", null, true)), loaded = true),
        )
    }
}
