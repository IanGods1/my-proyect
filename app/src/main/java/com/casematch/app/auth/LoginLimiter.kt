package com.casematch.app.auth

/**
 * Bloqueo por intentos fallidos: después de [MAX_ATTEMPTS] contraseñas incorrectas
 * se bloquea el ingreso durante [LOCK_MILLIS]. El estado se guarda para que cerrar
 * la app no reinicie el contador.
 */
class LoginLimiter(
    private val store: Store,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    interface Store {
        var failedAttempts: Int
        var lockedUntil: Long
    }

    /** Segundos que faltan para poder intentar de nuevo (0 = no está bloqueado). */
    fun remainingLockSeconds(): Int {
        val remaining = store.lockedUntil - clock()
        return if (remaining <= 0) 0 else ((remaining + 999) / 1000).toInt()
    }

    /** Registra un intento fallido. Devuelve true si con este intento se bloqueó. */
    fun registerFailure(): Boolean {
        val attempts = store.failedAttempts + 1
        return if (attempts >= MAX_ATTEMPTS) {
            store.failedAttempts = 0
            store.lockedUntil = clock() + LOCK_MILLIS
            true
        } else {
            store.failedAttempts = attempts
            false
        }
    }

    fun registerSuccess() {
        store.failedAttempts = 0
        store.lockedUntil = 0
    }

    companion object {
        const val MAX_ATTEMPTS = 5
        const val LOCK_MILLIS = 60_000L
    }
}
