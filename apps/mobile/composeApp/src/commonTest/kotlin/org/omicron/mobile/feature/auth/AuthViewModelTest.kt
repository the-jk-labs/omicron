package org.omicron.mobile.feature.auth

import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.domain.model.InstanceConfiguration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class AuthViewModelTest {
    @Test
    fun restoresTheSavedSessionAndMintsAnApiToken() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = AuthRepository(FakeAuthApi(session())),
                scope = TestScope(dispatcher),
            )

        testScheduler.advanceUntilIdle()

        val state = assertIs<AuthPhase.SignedIn>(viewModel.uiState.value.phase)
        assertEquals("ada", state.user.username)
    }

    @Test
    fun showsTheSignedOutStateWhenThereIsNoSavedSession() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val viewModel =
            AuthViewModel(
                savedInstance = { instance() },
                repository = AuthRepository(FakeAuthApi(null)),
                scope = TestScope(dispatcher),
            )

        testScheduler.advanceUntilIdle()

        assertIs<AuthPhase.SignedOut>(viewModel.uiState.value.phase)
    }
}

private class FakeAuthApi(
    private val session: AuthSessionDto?,
) : AuthApi {
    override suspend fun getSession(origin: String): AuthSessionDto? = session

    override suspend fun getToken(origin: String): AuthTokenDto = AuthTokenDto("signed-token")

    override suspend fun signOut(origin: String) = Unit
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
