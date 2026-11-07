export enum FailureCode {
    InsufficientFunds = "INSUFFICIENT_FUNDS",
    ReversalWouldOverdraw = "REVERSAL_WOULD_OVERDRAW",
    ReferenceNotFound = "REFERENCE_NOT_FOUND",
    ReferenceNotProcessed = "REFERENCE_NOT_PROCESSED",
    ReferenceMismatch = "REFERENCE_MISMATCH",
    InvalidReferenceKind = "INVALID_REFERENCE_KIND",
    AmountMismatch = "AMOUNT_MISMATCH",
    AlreadyReversed = "ALREADY_REVERSED",
    WalletPlayerMismatch = "CURRENCY_MISMATCH",
    UnrecoverableError = "UNRECOVERABLE_ERROR",
}
