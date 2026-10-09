package org.omicron.mobile.feature.settings

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.io.IOException
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.AppearancePreference
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SettingsViewModelTest {
    @Test
    fun loadsAppearanceAndConnectedInstance() = runTest {
        val store = FakeAppearanceStore(AppearancePreference.Dark)
        val viewModel = settingsViewModel(store = store)
        testScheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoading)
        assertEquals(AppearancePreference.Dark, state.appearance)
        assertEquals("https://omicron.blog", state.instance?.origin)
    }

    @Test
    fun selectingAppearancePersistsAndUpdatesState() = runTest {
        val store = FakeAppearanceStore(AppearancePreference.System)
        val viewModel = settingsViewModel(store = store)
        testScheduler.advanceUntilIdle()

        viewModel.setAppearance(AppearancePreference.Light)
        testScheduler.advanceUntilIdle()

        assertEquals(AppearancePreference.Light, viewModel.uiState.value.appearance)
        assertEquals(AppearancePreference.Light, store.preference)
        assertFalse(viewModel.uiState.value.isSavingAppearance)
    }

    @Test
    fun failedAppearanceWriteRollsBackAndCanRetry() = runTest {
        val store = FakeAppearanceStore(AppearancePreference.System, failure = IOException("disk unavailable"))
        val viewModel = settingsViewModel(store = store)
        testScheduler.advanceUntilIdle()

        viewModel.setAppearance(AppearancePreference.Dark)
        testScheduler.advanceUntilIdle()

        assertEquals(AppearancePreference.System, viewModel.uiState.value.appearance)
        assertTrue(viewModel.uiState.value.appearanceSaveFailed)

        store.failure = null
        viewModel.retryAppearanceSave()
        testScheduler.advanceUntilIdle()

        assertEquals(AppearancePreference.Dark, viewModel.uiState.value.appearance)
        assertEquals(AppearancePreference.Dark, store.preference)
        assertFalse(viewModel.uiState.value.appearanceSaveFailed)
    }

    @Test
    fun remoteSignOutFailureStillClearsTheLocalSession() = runTest {
        val api = FakeSettingsAuthApi(signOutFailure = IOException("offline"))
        val authRepository = authRepository(api)
        assertIs<org.omicron.mobile.data.repository.AuthenticationResult.Authenticated>(
            authRepository.signInUsername("https://omicron.blog", "alice", "password"),
        )
        val viewModel = settingsViewModel(authRepository = authRepository)
        testScheduler.advanceUntilIdle()

        viewModel.signOut()
        testScheduler.advanceUntilIdle()

        assertNull(authRepository.session.value)
        assertNull(viewModel.uiState.value.user)
        assertTrue(viewModel.uiState.value.signOutWarning)
        assertFalse(viewModel.uiState.value.isSigningOut)
    }

    private fun TestScope.settingsViewModel(
        store: AppearancePreferenceStore = FakeAppearanceStore(AppearancePreference.System),
        authRepository: AuthRepository = authRepository(FakeSettingsAuthApi()),
    ): SettingsViewModel {
        val dispatcher = StandardTestDispatcher(testScheduler)
        return SettingsViewModel(
            savedInstance = { instance() },
            authRepository = authRepository,
            appearanceStore = store,
            scope = TestScope(dispatcher),
        )
    }

    private fun authRepository(api: AuthApi) =
        AuthRepository(
            api = api,
            sessionCookieStore =
                object : SessionCookieStore {
                    override suspend fun read(origin: String): List<StoredSessionCookie> = emptyList()

                    override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) = Unit
                },
        )

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

    private class FakeAppearanceStore(
        var preference: AppearancePreference,
        var failure: Throwable? = null,
    ) : AppearancePreferenceStore {
        override suspend fun read(): AppearancePreference = preference

        override suspend fun write(preference: AppearancePreference) {
            failure?.let { throw it }
            this.preference = preference
        }
    }

    private class FakeSettingsAuthApi(
        var signOutFailure: Throwable? = null,
    ) : AuthApi {
        override suspend fun getSession(origin: String) = null

        override suspend fun getToken(origin: String) = AuthTokenDto("signed-token")

        override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto =
            throw UnsupportedOperationException()

        override suspend fun signInUsername(origin: String, username: String, password: String) =
            AuthSessionCreationDto(
                user = AuthUserDto("user-1", "alice@example.com", username, "Alice"),
                token = "signed-token",
            )

        override suspend fun signUpEmail(
            origin: String,
            email: String,
            password: String,
            username: String,
            displayName: String,
        ): AuthSessionCreationDto = throw UnsupportedOperationException()

        override suspend fun signOut(origin: String) {
            signOutFailure?.let { throw it }
        }
    }
}
