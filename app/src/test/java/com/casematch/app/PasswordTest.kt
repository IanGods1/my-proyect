package com.casematch.app

import com.casematch.app.auth.LoginLimiter
import com.casematch.app.util.PasswordHasher
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class PasswordTest {

    @Test fun hashAndVerify() {
        val stored = PasswordHasher.hashForStorage("secreto123", iterations = 1000)
        assertFalse(stored.contains("secreto123"))
        assertTrue(PasswordHasher.verify("secreto123", stored))
        assertFalse(PasswordHasher.verify("secreto124", stored))
        assertFalse(PasswordHasher.verify("secreto123", null))
        assertFalse(PasswordHasher.verify("secreto123", "basura"))
        // Misma contraseña, distinta sal -> distinto hash
        assertNotEquals(stored, PasswordHasher.hashForStorage("secreto123", iterations = 1000))
    }

    @Test fun deriveIsDeterministic() {
        val salt = PasswordHasher.newSalt()
        assertEquals(PasswordHasher.derive("abc123", salt, 1000), PasswordHasher.derive("abc123", salt, 1000))
        assertNotEquals(PasswordHasher.derive("abc123", salt, 1000), PasswordHasher.derive("abc124", salt, 1000))
        assertEquals(64, PasswordHasher.derive("abc123", salt, 1000).length)
    }

    @Test fun lockAfterFiveFailures() {
        var now = 1_000_000L
        val store = object : LoginLimiter.Store {
            override var failedAttempts = 0
            override var lockedUntil = 0L
        }
        val limiter = LoginLimiter(store) { now }
        repeat(4) { assertFalse(limiter.registerFailure()) }
        assertEquals(0, limiter.remainingLockSeconds())
        assertTrue(limiter.registerFailure())
        assertEquals(60, limiter.remainingLockSeconds())
        now += 30_000
        assertEquals(30, limiter.remainingLockSeconds())
        now += 30_001
        assertEquals(0, limiter.remainingLockSeconds())
        // El contador vuelve a empezar después del bloqueo
        assertFalse(limiter.registerFailure())
        limiter.registerSuccess()
        assertEquals(0, store.failedAttempts)
    }
}
