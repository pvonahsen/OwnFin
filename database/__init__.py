# Re-export every public symbol so that `import database` keeps working
# identically to the old monolithic database.py.
#
# NOTE: DB_PATH is NOT imported as a simple name here; instead __getattr__
# below delegates reads of `database.DB_PATH` to `database.core.DB_PATH` so
# that test fixtures that patch `database.core.DB_PATH` are also visible
# through `database.DB_PATH`.

from . import core as _core

from .core import (
    DEFAULT_SETTINGS,
    get_conn,
    get_db,
    init_db,
    _recalc_all_positions,
)

from .users import (
    get_users,
    get_user,
    get_regular_users,
    create_user,
    update_user,
    delete_user,
    needs_setup,
)


def __getattr__(name):
    """Delegate attribute lookups for DB_PATH to database.core so patches propagate."""
    if name == "DB_PATH":
        return _core.DB_PATH
    raise AttributeError(f"module 'database' has no attribute {name!r}")

from .portfolio import (
    # Positions
    get_positions,
    get_position,
    create_position,
    update_position,
    deactivate_position,
    # Prices
    upsert_price,
    get_latest_prices,
    get_price_history,
    get_last_sync,
    save_last_sync,
    # Dividends
    get_dividends,
    upsert_dividend,
    delete_dividend,
    # Sparplans
    get_sparplans,
    get_sparplan,
    create_sparplan,
    update_sparplan,
    deactivate_sparplan,
    # Baselines
    save_baseline,
    get_baseline,
    # Imports
    log_import,
    get_import_history,
    # Transactions
    get_transactions,
    add_transaction,
    transaction_exists,
    delete_transaction,
)

from .planning import (
    get_settings,
    get_settings_gemeinsam,
    save_settings,
    get_checkins,
    get_checkin,
    upsert_checkin,
    delete_checkin,
)

from .banking import (
    get_own_accounts,
    add_own_account,
    delete_own_account,
    get_own_account_ibans,
    get_bank_accounts,
    create_bank_account,
    get_bank_transactions,
    upsert_bank_transaction,
    update_bank_transaction,
    delete_bank_transaction,
    get_bank_categories,
    upsert_bank_category,
    set_category_bucket,
    get_bank_budgets,
    get_bank_budget_templates,
    upsert_bank_budget,
    get_cat_rules,
    upsert_cat_rule,
    delete_cat_rule,
    apply_cat_rule_to_tx,
    apply_cat_rules_to_all,
    get_bank_cashflow,
)

from .broker_cash import (
    get_broker_cash,
    get_broker_cash_total,
    upsert_broker_cash,
)

from .phases import (
    get_phases,
    get_phases_gemeinsam,
    save_phases,
)
