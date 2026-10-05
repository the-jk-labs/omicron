package org.omicron.mobile.data.repository

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.buildJsonObject
import org.omicron.mobile.data.api.AuthApi
import org.omicron.mobile.data.api.AuthSessionDto
import org.omicron.mobile.data.api.AuthTokenDto
import org.omicron.mobile.data.api.AuthUserDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class AuthRepositoryTest {
    @Test
    fun mintsAndKeepsAnInMemoryTokenForTheRestoredSession() = runTest {
        val repository = AuthRepository(FakeAuthApi(session = session()))

        val restored = repository.restore("https://omicron.blog")

        assertEquals("signed-token", restored?.accessToken)
        assertEquals("ada", restored?.user?.username)
        assertEquals(restored, repository.currentSession())
    }

    @Test
    fun clearsAnExistingTokenWhenNoSessionCanBeRestored() = runTest {
        val api = FakeAuthApi(session = session())
        val repository = AuthRepository(api)
        repository.restore("https://omicron.blog")
        api.session = null

        assertNull(repository.restore("https://omicron.blog"))
        assertNull(repository.currentSession())
    }
}

private class FakeAuthApi(
    var session: AuthSessionDto?,
) : AuthApi {
    override suspend fun getSession(origin: String): AuthSessionDto? = session

    override suspend fun getToken(origin: String): AuthTokenDto = AuthTokenDto("signed-token")

    override suspend fun signOut(origin: String) = Unit
}

private fun session() =
    AuthSessionDto(
        user = AuthUserDto(id = "user-1", email = "ada@example.com", username = "ada", displayName = "Ada"),
        session = buildJsonObject {},
    )
