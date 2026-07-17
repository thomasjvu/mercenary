// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal ERC20 surface used by escrows (SafeERC20-style optional return).
interface IERC20Escrow {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice OpenZeppelin-style optional-return token helpers without an external dependency.
library TokenTransfer {
    function safeTransfer(IERC20Escrow token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(
        IERC20Escrow token,
        address from,
        address to,
        uint256 value
    ) internal {
        _callOptionalReturn(
            token,
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
    }

    /// @dev Pull `value` and require the escrow balance increased by exactly `value` (rejects FoT).
    function pullExact(
        IERC20Escrow token,
        address from,
        uint256 value
    ) internal returns (uint256 received) {
        uint256 beforeBal = token.balanceOf(address(this));
        safeTransferFrom(token, from, address(this), value);
        uint256 afterBal = token.balanceOf(address(this));
        require(afterBal >= beforeBal, "balance underflow");
        received = afterBal - beforeBal;
        require(received == value, "amount mismatch");
    }

    function _callOptionalReturn(IERC20Escrow token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "token call failed");
        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "transfer failed");
        }
    }
}
