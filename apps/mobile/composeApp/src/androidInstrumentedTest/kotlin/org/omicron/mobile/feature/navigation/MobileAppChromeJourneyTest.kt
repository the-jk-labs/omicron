package org.omicron.mobile.feature.navigation

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.domain.model.AuthenticatedUser
import org.omicron.mobile.domain.model.MobileNotification
import org.omicron.mobile.domain.model.PostAuthor

@RunWith(AndroidJUnit4::class)
class MobileAppChromeJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun bottomNavigationExposesFiveSelectedDestinations() {
        var selected by mutableStateOf<PrimaryTab?>(PrimaryTab.Home)
        composeTestRule.setContent {
            OmicronTheme {
                Column {
                    MobileBottomBar(selected = selected, onSelect = { selected = it })
                }
            }
        }

        composeTestRule.onNodeWithText("Home").assertIsSelected()
        composeTestRule.onNodeWithText("Lists").performClick()
        assertEquals(PrimaryTab.Lists, selected)
        composeTestRule.onNodeWithText("Write").performClick()
        assertEquals(PrimaryTab.Write, selected)
        composeTestRule.onNodeWithText("Stats").performClick()
        assertEquals(PrimaryTab.Stats, selected)
        composeTestRule.onNodeWithText("Profile").performClick()
        assertEquals(PrimaryTab.Profile, selected)
    }

    @Test
    fun accountMenuOpensAndRoutesToPostManagement() {
        var action: AccountAction? = null
        composeTestRule.setContent {
            OmicronTheme {
                MobileTopBar(
                    appName = "Omicron",
                    user = AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
                    unreadCount = 2,
                    onSearch = {},
                    onNotifications = {},
                    onAccountAction = { action = it },
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Account menu").performClick()
        composeTestRule.onNodeWithText("Your posts").assertIsDisplayed().performClick()

        assertEquals(AccountAction.YourPosts, action)
    }

    @Test
    fun guestCanOpenDeviceSettingsFromTheTopBar() {
        var action: AccountAction? = null
        composeTestRule.setContent {
            OmicronTheme {
                MobileTopBar(
                    appName = "Omicron",
                    user = null,
                    unreadCount = 0,
                    onSearch = {},
                    onNotifications = {},
                    onAccountAction = { action = it },
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Settings").performClick()

        assertEquals(AccountAction.Settings, action)
    }

    @Test
    fun mobileChromeFitsNarrowWidthAndLargerFontScale() {
        composeTestRule.setContent {
            val density = LocalDensity.current
            OmicronTheme {
                CompositionLocalProvider(LocalDensity provides Density(density.density, 1.3f)) {
                    Column(modifier = androidx.compose.ui.Modifier.width(320.dp)) {
                        MobileTopBar(
                            appName = "A very long custom instance name",
                            user = AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
                            unreadCount = 12,
                            onSearch = {},
                            onNotifications = {},
                            onAccountAction = {},
                        )
                        MobileBottomBar(selected = PrimaryTab.Home, onSelect = {})
                    }
                }
            }
        }

        composeTestRule.onNodeWithContentDescription("Search").assertIsDisplayed().assertHeightIsAtLeast(48.dp)
        composeTestRule.onNodeWithContentDescription("Notifications").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Account menu").assertIsDisplayed()
        assertTrue(composeTestRule.onAllNodesWithContentDescription("Toggle theme").fetchSemanticsNodes().isEmpty())
        composeTestRule.onNodeWithText("Profile").assertIsDisplayed()
    }

    @Test
    fun notificationBellShowsPreviewAndSeeAllDestination() {
        var openedAll = false
        val notification =
            MobileNotification(
                id = "notification-1",
                type = "like",
                actor = PostAuthor("actor-1", "alice", "Alice", null, false),
                postId = "post-1",
                postTitle = "A useful article",
                commentSnippet = null,
                read = false,
                createdAt = "2026-01-01T00:00:00Z",
            )
        composeTestRule.setContent {
            OmicronTheme {
                MobileTopBar(
                    appName = "Omicron",
                    user = AuthenticatedUser("user-1", "ada@example.com", "ada", "Ada"),
                    unreadCount = 2,
                    notifications = listOf(notification),
                    onSearch = {},
                    onNotifications = { openedAll = true },
                    onAccountAction = {},
                )
            }
        }

        composeTestRule.onNodeWithContentDescription("Notifications").performClick()
        composeTestRule.onNodeWithText("Alice").assertIsDisplayed()
        composeTestRule.onNodeWithText("See all").performClick()

        assertEquals(true, openedAll)
    }
}
