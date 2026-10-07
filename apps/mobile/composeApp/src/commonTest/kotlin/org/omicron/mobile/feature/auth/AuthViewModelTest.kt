package org.omicron.mobile.feature.auth

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthApiException
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthSessionCreationDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.core.storage.SessionCookieStore
import org.omicron.mobile.core.storage.StoredSessionCookie
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

class AuthViewModelTest {
    @Test
    fun restoresTheSavedSessionAndMintsAnApiToken() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(session())),
                scope = TestScope(dispatcher),
            )

        testScheduler.advanceUntilIdle()

        val state = assertIs<AuthPhase.SignedIn>(viewModel.uiState.value.phase)
        assertEquals("ada", state.user.username)
    }

    @Test
    fun showsTheSignInStateWhenThereIsNoSavedSession() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(null)),
                scope = TestScope(dispatcher),
            )

        testScheduler.advanceUntilIdle()

        assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
    }

    @Test
    fun signsInWithAUsernameAndPassword() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(null)),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.updateIdentifier("@ada")
        viewModel.updatePassword("Unique-test-password-123!")
        viewModel.signIn()
        testScheduler.advanceUntilIdle()

        assertIs<AuthPhase.SignedIn>(viewModel.uiState.value.phase)
    }

    @Test
    fun showsAnInvalidCredentialsErrorWithoutTreatingItAsAnAvailabilityFailure() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(null, signInFailure = AuthApiException("INVALID_USERNAME_OR_PASSWORD"))),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.updateIdentifier("ada")
        viewModel.updatePassword("Unique-test-password-123!")
        viewModel.signIn()
        testScheduler.advanceUntilIdle()

        val state = assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
        assertEquals(AuthFormError.InvalidCredentials, state.error)
    }

    @Test
    fun rejectsAnInvalidEmailBeforeSendingCredentials() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(null)),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.updateIdentifier("ada@example")
        viewModel.updatePassword("Unique-test-password-123!")
        viewModel.signIn()

        val state = assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
        assertEquals(AuthFormError.InvalidEmail, state.error)
    }

    @Test
    fun showsVerificationRequiredAfterRegistrationWithoutASession() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(null, signUpToken = null)),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.showRegistration()
        viewModel.updateUsername("ada")
        viewModel.updateEmail("ada@example.com")
        viewModel.updatePassword("Unique-test-password-123!")
        viewModel.updateConfirmation("Unique-test-password-123!")
        viewModel.register()
        testScheduler.advanceUntilIdle()

        val state = assertIs<AuthPhase.VerificationRequired>(viewModel.uiState.value.phase)
        assertEquals("ada@example.com", state.email)

        viewModel.showSignIn()

        val signIn = assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
        assertEquals("ada@example.com", signIn.form.identifier)
    }

    @Test
    fun signsOutToAllowAnotherAccountToSignIn() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(session())),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.signOut()
        testScheduler.advanceUntilIdle()

        assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
    }

    @Test
    fun signsOutLocallyWhenTheRemoteSignOutRequestFails() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = authRepository(FakeAuthApi(session(), signOutFailure = IllegalStateException("offline"))),
                scope = TestScope(dispatcher),
            )
        testScheduler.advanceUntilIdle()

        viewModel.signOut()
        testScheduler.advanceUntilIdle()

        val credentials = assertIs<AuthPhase.Credentials>(viewModel.uiState.value.phase)
        assertTrue(credentials.signOutWarning)
    }
}

private fun authRepository(api: AuthApi) = AuthRepository(api, FakeSessionCookieStore())

private class FakeSessionCookieStore : SessionCookieStore {
    private val cookies = mutableMapOf<String, List<StoredSessionCookie>>()

    override suspend fun read(origin: String): List<StoredSessionCookie> = cookies[origin].orEmpty()

    override suspend fun write(origin: String, cookies: List<StoredSessionCookie>) {
        this.cookies[origin] = cookies
    }
}

private class FakeAuthApi(
    private var session: AuthSessionDto?,
    private val signUpToken: String? = "session-token",
    private val signInFailure: Throwable? = null,
    private val signOutFailure: Throwable? = null,
) : AuthApi {
    override suspend fun getSession(origin: String): AuthSessionDto? = session

    override suspend fun getToken(origin: String): AuthTokenDto = AuthTokenDto("signed-token")

    override suspend fun signInEmail(origin: String, email: String, password: String): AuthSessionCreationDto {
        signInFailure?.let { throw it }
        session = session()
        return creation()
    }

    override suspend fun signInUsername(origin: String, username: String, password: String): AuthSessionCreationDto {
        signInFailure?.let { throw it }
        session = session()
        return creation()
    }

    override suspend fun signUpEmail(
        origin: String,
        email: String,
        password: String,
        username: String,
        displayName: String,
    ): AuthSessionCreationDto {
        if (signUpToken != null) session = session()
        return creation(signUpToken)
    }

    override suspend fun signOut(origin: String) {
        signOutFailure?.let { throw it }
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

private fun session() =
    AuthSessionDto(
        user = AuthUserDto(id = "user-1", email = "ada@example.com", username = "ada", displayName = "Ada"),
        session = buildJsonObject {},
    )

private fun creation(token: String? = "session-token") = AuthSessionCreationDto(user = session().user, token = token)
