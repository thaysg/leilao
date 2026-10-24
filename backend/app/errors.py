class ApiError(Exception):
    """Business error with a stable machine code and a human message (pt-BR) for the UI."""

    def __init__(self, code: str, message: str, status: int = 409, **extra):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.extra = extra
