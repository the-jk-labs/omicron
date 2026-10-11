package org.omicron.mobile.feature.profile

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.feature.navigation.AccountAction

@RunWith(AndroidJUnit4::class)
class ProfileMenuJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun ownProfileMenuRoutesToPostManagementSettingsAndSignOut() {
        val actions = mutableListOf<AccountAction>()
        composeTestRule.setContent {
            OmicronTheme {
                ProfileMenuBar(username = "ada", isSelf = true, signedIn = true, onAction = actions::add)
            }
        }

        composeTestRule.onNodeWithText("ada").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Account menu").performClick()
        composeTestRule.onNodeWithText("Your posts").assertIsDisplayed().performClick()
        assertEquals(listOf(AccountAction.YourPosts), actions)

        composeTestRule.onNodeWithContentDescription("Account menu").performClick()
        composeTestRule.onNodeWithText("Settings").performClick()
        composeTestRule.onNodeWithContentDescription("Account menu").performClick()
        composeTestRule.onNodeWithText("Sign out").performClick()
        assertEquals(listOf(AccountAction.YourPosts, AccountAction.Settings, AccountAction.SignOut), actions)
    }

    @Test
    fun guestProfileMenuOffersSettingsOnly() {
        composeTestRule.setContent {
            OmicronTheme {
                ProfileMenuBar(username = "ada", isSelf = false, signedIn = false, onAction = {})
            }
        }

        composeTestRule.onNodeWithContentDescription("Account menu").performClick()
        composeTestRule.onNodeWithText("Settings").assertIsDisplayed()
        assertTrue(composeTestRule.onAllNodesWithText("Your posts").fetchSemanticsNodes().isEmpty())
        assertTrue(composeTestRule.onAllNodesWithText("Sign out").fetchSemanticsNodes().isEmpty())
    }
}
