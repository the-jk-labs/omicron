package org.omicron.mobile.feature.settings

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.InstanceConfiguration

@RunWith(AndroidJUnit4::class)
class SettingsJourneyTest {
    @get:Rule
    val composeTestRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun appearanceChoicePersistsAndInstanceCanBeChanged() {
        val store = JourneyAppearanceStore()
        val viewModel =
            SettingsViewModel(
                savedInstance = { instance() },
                authRepository = authRepository(),
                appearanceStore = store,
            )
        var requestedInstanceChange = false
        var requestedOfflineReading = false
        composeTestRule.setContent {
            val state by viewModel.uiState.collectAsState()
            OmicronTheme(appearance = state.appearance) {
                SettingsRoute(
                    viewModel = viewModel,
                    onBack = {},
                    onChangeInstance = { requestedInstanceChange = true },
                    onSignIn = {},
                    onOpenOfflineReading = { requestedOfflineReading = true },
                )
            }
        }

        composeTestRule.waitForText("Connected to Omicron")
        composeTestRule.onNodeWithText("System").assertIsSelected()
        composeTestRule.onNodeWithText("Dark").performClick()
        composeTestRule.waitUntil(timeoutMillis = 5_000) { store.preference == AppearancePreference.Dark }
        composeTestRule.onNodeWithText("Dark").assertIsSelected()
        composeTestRule.onNodeWithText("System").assertIsNotSelected()
        composeTestRule.onNodeWithText("About Omicron").assertIsDisplayed()
        composeTestRule.onNodeWithText("Change instance").performClick()
        composeTestRule.onNodeWithText("View saved articles").performClick()

        assertEquals(AppearancePreference.Dark, store.preference)
        assertTrue(requestedInstanceChange)
        assertTrue(requestedOfflineReading)
        viewModel.close()
    }

    private fun ComposeTestRule.waitForText(text: String) {
        waitUntil(timeoutMillis = 5_000) {
            onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty()
        }
    }
}

private fun instance() =
    InstanceConfiguration(
        origin = "https://omicron.blog",
        name = "Omicron",
        domain = "omicron.blog",
        federationEnabled = true,
        setupComplete = true,
        emailEnabled = true,
        emailVerificationRequired = true,
    )

private fun authRepository() =
    AuthRepository(
        api =
            object : AuthApi {
                override suspend fun getSession(origin: String) = null

                override suspend fun getToken(origin: String) = AuthTokenDto("signed-token")

                override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto =
                    throw UnsupportedOperationException()

                override suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto =
                    throw UnsupportedOperationException()

                override suspend fun signUpEmail(
                    origin: String,
                    email: String,
                    password: String,
                    username: String,
                    displayName: String,
                ): AuthSessionCreationDto = throw UnsupportedOperationException()

                override suspend fun signOut(origin: String) = Unit
            },
        sessionCookieStore =
            object : SessionCookieStore {
                override suspend fun read(origin: String): List<StoredSessionCookie> = emptyList()

                override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) = Unit
            },
    )

private class JourneyAppearanceStore : AppearancePreferenceStore {
    var preference = AppearancePreference.System

    override suspend fun read() = preference

    override suspend fun write(preference: AppearancePreference) {
        this.preference = preference
    }
}
