package org.omicron.mobile.feature.navigation

import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.serialization.Serializable
import org.junit.Rule
import org.junit.Test
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant

class MobileTopLevelNavigationJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun topLevelTabsReplaceTheirScreenAndBackReturnsHome() {
        composeTestRule.setContent {
            OmicronTheme {
                val navController = rememberNavController()
                val entry by navController.currentBackStackEntryAsState()
                val homeRoute = HomeDestination.serializer().descriptor.serialName
                val listsRoute = ListsDestination.serializer().descriptor.serialName
                val statsRoute = StatsDestination.serializer().descriptor.serialName
                val selected =
                    when (entry?.destination?.route) {
                        homeRoute -> PrimaryTab.Home
                        listsRoute -> PrimaryTab.Lists
                        statsRoute -> PrimaryTab.Stats
                        else -> null
                    }
                Column(modifier = Modifier.fillMaxSize()) {
                    NavHost(navController = navController, startDestination = HomeDestination, modifier = Modifier.weight(1f)) {
                        composable<HomeDestination> { Text("Home surface", variant = TextVariant.H2) }
                        composable<ListsDestination> { Text("Lists surface", variant = TextVariant.H2) }
                        composable<StatsDestination> { Text("Stats surface", variant = TextVariant.H2) }
                    }
                    MobileBottomBar(selected = selected) { tab ->
                        val route =
                            when (tab) {
                                PrimaryTab.Home -> HomeDestination
                                PrimaryTab.Lists -> ListsDestination
                                PrimaryTab.Write -> StatsDestination
                                PrimaryTab.Stats -> StatsDestination
                                PrimaryTab.Profile -> HomeDestination
                            }
                        navController.navigateTopLevel(route, HomeDestination)
                    }
                }
            }
        }

        composeTestRule.onNodeWithText("Home surface").assertIsDisplayed()
        composeTestRule.onNodeWithText("Lists").performClick()
        composeTestRule.onNodeWithText("Lists surface").assertIsDisplayed()
        composeTestRule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        composeTestRule.onNodeWithText("Home surface").assertIsDisplayed()
        composeTestRule.onNodeWithText("Stats").performClick()
        composeTestRule.onNodeWithText("Stats surface").assertIsDisplayed()
    }

    @Serializable
    private data object HomeDestination

    @Serializable
    private data object ListsDestination

    @Serializable
    private data object StatsDestination
}
